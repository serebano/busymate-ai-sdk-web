import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBusymateChat, type BusymateChat } from "../src/index.js";
import { ORIGIN, cleanup, fakeFrame } from "./fakeFrame.js";

let chat: BusymateChat | null = null;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ frameable: true }), { status: 200 })));
});

afterEach(() => {
  cleanup(chat);
  chat = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("options", () => {
  it("validates the assistant slug, origin, mode, locale and theme", () => {
    expect(() => createBusymateChat({ assistant: "Bad Slug" })).toThrow(/assistant/);
    expect(() => createBusymateChat({ assistant: "acme", origin: "http://acme.example.com" })).toThrow(/origin/);
    expect(() => createBusymateChat({ assistant: "acme", origin: "https://*.busymate.ai" })).toThrow(/origin/);
    expect(() => createBusymateChat({ assistant: "acme", origin: "https://acme.busymate.ai/support" })).toThrow(/origin/);
    expect(() => createBusymateChat({ assistant: "acme", mode: "popup" as never })).toThrow(/mode/);
    expect(() => createBusymateChat({ assistant: "acme", locale: "not a locale" })).toThrow(/locale/);
    expect(() => createBusymateChat({ assistant: "acme", theme: "blue" as never })).toThrow(/theme/);
  });

  it("defaults the origin to https://<assistant>.busymate.ai and reports versions", () => {
    chat = createBusymateChat({ assistant: "acme" });
    expect(chat.origin).toBe(ORIGIN);
    expect(chat.version).toBe("0.1.0");
    expect(chat.contractVersion).toBe(1);
    expect(chat.mode).toBe("launcher");
  });
});

describe("mount", () => {
  it("launches the pinned embed frame with the visitor token in the fragment", () => {
    chat = createBusymateChat({ assistant: "acme", locale: "de" });
    expect(chat.mount()).toBe(true);
    expect(chat.mount()).toBe(false);
    const iframe = document.querySelector("iframe")!;
    const src = new URL(iframe.src);
    expect(src.origin).toBe(ORIGIN);
    expect(src.pathname).toBe("/support/acme");
    expect(src.searchParams.get("channel")).toBe("embed");
    expect(src.searchParams.get("bridge")).toBe("busymate-ai-v1");
    expect(src.searchParams.get("host")).toBe("https://shop.example.com");
    expect(src.searchParams.get("page")).toBe("/products/42");
    expect(src.searchParams.get("locale")).toBe("de");
    const fragment = new URLSearchParams(src.hash.slice(1));
    expect(fragment.get("bmai_visitor")).toMatch(/^[A-Za-z0-9._-]{16,200}$/);
    expect(fragment.has("bmai_token")).toBe(false);
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-forms allow-same-origin");
    expect(iframe.allow).toBe("tools; microphone; autoplay");
    expect(iframe.referrerPolicy).toBe("strict-origin-when-cross-origin");
    // The fragment never leaves the page in the reported frame URL.
    expect(chat.frameUrl()).not.toContain("#");
    expect(document.documentElement.getAttribute("data-bmai-chat")).toBe("closed");
  });

  it("keeps a returning visitor's token (shared with the hosted loader's key)", () => {
    localStorage.setItem("bm_support_visitor:acme", "returning-visitor-token-0001");
    chat = createBusymateChat({ assistant: "acme" });
    chat.mount();
    const fragment = new URLSearchParams(new URL(document.querySelector("iframe")!.src).hash.slice(1));
    expect(fragment.get("bmai_visitor")).toBe("returning-visitor-token-0001");
  });

  it("persists a new visitor token only on the first open, and never before consent", () => {
    chat = createBusymateChat({ assistant: "acme", consent: "wait" });
    chat.mount();
    expect(localStorage.getItem("bm_support_visitor:acme")).toBeNull();
    chat.open();
    expect(localStorage.getItem("bm_support_visitor:acme")).toBeNull();
    chat.releaseConsent();
    expect(localStorage.getItem("bm_support_visitor:acme")).toMatch(/^[A-Za-z0-9._-]{16,}$/);
  });

  it("unmount removes every element, attribute and listener", () => {
    chat = createBusymateChat({ assistant: "acme" });
    chat.mount();
    const frame = fakeFrame();
    const onClose = vi.fn();
    chat.on("close", onClose);
    chat.unmount();
    expect(document.querySelector("iframe")).toBeNull();
    expect(document.querySelector("[data-bmai-web]")).toBeNull();
    expect(document.querySelectorAll("style").length).toBe(0);
    expect(document.documentElement.hasAttribute("data-bmai-chat")).toBe(false);
    frame.say({ type: "busymate.ai.v1.close" });
    expect(onClose).not.toHaveBeenCalled();
    expect(chat.mounted).toBe(false);
    expect(chat.mount()).toBe(true);
  });

  it("panel mode draws no launcher; inline mode fills the container", () => {
    chat = createBusymateChat({ assistant: "acme", mode: "panel" });
    chat.mount();
    expect(document.querySelector("[data-bmai-web] > button")).toBeNull();
    chat.unmount();

    const host = document.createElement("section");
    host.id = "help";
    document.body.appendChild(host);
    chat = createBusymateChat({ assistant: "acme", mode: "inline", container: "#help" });
    chat.mount();
    expect(host.querySelector("iframe")).not.toBeNull();
    expect(chat.isOpen()).toBe(true);
  });

  it("inline mode without a container reports invalid_option", () => {
    chat = createBusymateChat({ assistant: "acme", mode: "inline" });
    const onError = vi.fn();
    chat.on("error", onError);
    expect(chat.mount()).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "invalid_option" }));
  });
});

describe("open and close", () => {
  it("the launcher toggles the panel and emits typed events", () => {
    chat = createBusymateChat({ assistant: "acme" });
    chat.mount();
    const events: string[] = [];
    chat.on("open", (e) => events.push("open:" + e.source));
    chat.on("close", (e) => events.push("close:" + e.source));
    const winEvents: string[] = [];
    window.addEventListener("bmai:chat-open", () => winEvents.push("open"));
    window.addEventListener("bmai:chat-close", () => winEvents.push("close"));
    const button = document.querySelector("[data-bmai-web] > button") as HTMLButtonElement;
    button.click();
    expect(chat.isOpen()).toBe(true);
    expect(document.documentElement.getAttribute("data-bmai-chat")).toBe("open");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const frame = fakeFrame();
    frame.say({ type: "busymate.ai.v1.close" });
    expect(chat.isOpen()).toBe(false);
    chat.open();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(events).toEqual(["open:launcher", "close:frame", "open:api", "close:escape"]);
    expect(winEvents).toEqual(["open", "close", "open", "close"]);
  });

  it("re-opens on the next page of the same tab", () => {
    sessionStorage.setItem("bm_widget_open:acme", "1");
    chat = createBusymateChat({ assistant: "acme" });
    chat.mount();
    expect(chat.isOpen()).toBe(true);
  });
});

describe("the pinned wire", () => {
  it("ignores messages from another origin or another window", () => {
    chat = createBusymateChat({ assistant: "acme" });
    chat.mount();
    chat.open();
    const frame = fakeFrame();
    frame.say({ type: "busymate.ai.v1.close" }, { origin: "https://evil.example" });
    frame.say({ type: "busymate.ai.v1.close" }, { source: window });
    expect(chat.isOpen()).toBe(true);
  });

  it("queues commands until the frame says ready, then delivers them to the exact origin", () => {
    chat = createBusymateChat({ assistant: "acme", theme: "dark" });
    chat.mount();
    const frame = fakeFrame();
    expect(chat.ask("  ")).toBe(false);
    expect(chat.ask("Where is my order?", { submit: false })).toBe(true);
    expect(chat.setLocale("fr")).toBe(true);
    expect(chat.setLocale("nope nope")).toBe(false);
    expect(chat.setTheme("purple" as never)).toBe(false);
    expect(frame.sent("busymate.ai.v1.ask")).toHaveLength(0);
    const ready = vi.fn();
    chat.on("ready", ready);
    frame.say({ type: "busymate.ai.v1.ready", visitorKind: "anonymous" });
    expect(ready).toHaveBeenCalledWith({ visitorKind: "anonymous" });
    const ask = frame.sent("busymate.ai.v1.ask")[0]!;
    expect(ask).toMatchObject({ prompt: "Where is my order?", submit: false });
    expect(frame.sent("busymate.ai.v1.theme")[0]).toMatchObject({ theme: "dark" });
    expect(frame.sent("busymate.ai.v1.locale")[0]).toMatchObject({ locale: "fr" });
    for (const [, target] of frame.posts) expect(target).toBe(ORIGIN);
  });

  it("answers the resizable request and declines the floating window", () => {
    chat = createBusymateChat({ assistant: "acme" });
    chat.mount();
    const frame = fakeFrame();
    frame.say({ type: "busymate.ai.v1.resizable_request" });
    expect(frame.sent("busymate.ai.v1.resizable")[0]).toMatchObject({ side: "right" });
    frame.say({ type: "bmai:pip:prepare" });
    expect(frame.sent("bmai:pip:ready")[0]).toMatchObject({ ok: false });
  });

  it("emits every busymate.* frame message for observability, and sessionEnded", () => {
    chat = createBusymateChat({ assistant: "acme" });
    chat.mount();
    const frame = fakeFrame();
    const messages: string[] = [];
    chat.on("message", (m) => messages.push(m.type));
    const ended = vi.fn();
    chat.on("sessionEnded", ended);
    frame.say({ type: "busymate.ai.v1.session_ended", sessionId: "s1" });
    frame.say({ type: "busymate.ai.v1.something_new" });
    frame.say({ type: "unrelated" });
    expect(messages).toEqual(["busymate.ai.v1.session_ended", "busymate.ai.v1.something_new"]);
    expect(ended).toHaveBeenCalledWith({ sessionId: "s1" });
  });

  it("opens external links with noopener and routes same-origin links in place", () => {
    const opened = vi.spyOn(window, "open").mockReturnValue(null);
    const onNavigate = vi.fn(() => true);
    chat = createBusymateChat({ assistant: "acme", onNavigate });
    chat.mount();
    const frame = fakeFrame();
    frame.say({ type: "busymate.ai.v1.open_url", url: "https://docs.example.org/a" });
    frame.say({ type: "busymate.ai.v1.open_url", url: "javascript:alert(1)" });
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledWith("https://docs.example.org/a", "_blank", "noopener,noreferrer");
    frame.say({ type: "busymate.ai.v1.navigate", href: "https://evil.example/x" });
    frame.say({ type: "busymate.ai.v1.navigate", href: "/orders/7" });
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith("https://shop.example.com/orders/7");
  });

  it("hands an in-chat sign-in to the page when it claims it", () => {
    const onSignInRequest = vi.fn(() => true);
    chat = createBusymateChat({ assistant: "acme", onSignInRequest });
    chat.mount();
    const frame = fakeFrame();
    frame.say({ type: "busymate.ai.v1.auth_request", url: "https://shop.example.com/login" });
    expect(onSignInRequest).toHaveBeenCalledWith("https://shop.example.com/login");
  });
});

describe("embed preflight", () => {
  it("reports origin_not_allowed when the workspace does not allow this page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ frameable: false }), { status: 200 })));
    chat = createBusymateChat({ assistant: "acme" });
    const errors: string[] = [];
    chat.on("error", (e) => errors.push(e.code));
    chat.mount();
    chat.open();
    await vi.waitFor(() => expect(errors).toContain("origin_not_allowed"));
    expect(chat.linkStatus).toMatchObject({ state: "failed", reason: "origin_not_allowed" });
    const url = String((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0]);
    expect(url).toBe(`${ORIGIN}/api/embed-status?assistant=acme&ancestors=${encodeURIComponent("https://shop.example.com")}`);
  });
});
