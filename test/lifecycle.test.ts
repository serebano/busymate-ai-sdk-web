import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBusymateChat, cspDirectives, WEB_LIFECYCLE_ALIASES, WEB_LIFECYCLE_NAMES, DESKTOP_CHANNEL, type BusymateChat } from "../src/index.js";
import { PAGE_TOOLS_PATH } from "../src/pagetools.js";
import { cleanup, fakeFrame, ORIGIN } from "./fakeFrame.js";

let chat: BusymateChat | null = null;
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ frameable: true }), { status: 200 })));
});
afterEach(() => {
  cleanup(chat);
  chat = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("lifecycle names come from the identity contract", () => {
  it("the contract's four calls exist (getIdentity and account are options) and every alias is a function", () => {
    expect([...WEB_LIFECYCLE_NAMES]).toEqual(["getIdentity", "identityChanged", "signedOut", "account"]);
    chat = createBusymateChat({ assistant: "acme" });
    expect(typeof chat.identityChanged).toBe("function");
    expect(typeof chat.signedOut).toBe("function");
    for (const { alias } of WEB_LIFECYCLE_ALIASES) expect(typeof (chat as unknown as Record<string, unknown>)[alias], alias).toBe("function");
    expect(DESKTOP_CHANNEL).toBe("desktop_sdk");
  });

  it("signedOut() is the canonical logout; logout() and setUser(null) are the same message", () => {
    chat = createBusymateChat({ assistant: "acme" });
    chat.mount();
    const frame = fakeFrame();
    frame.say({ type: "busymate.ai.v1.ready", visitorKind: "identified" });
    chat.signedOut();
    chat.logout();
    chat.setUser(null);
    chat.signedOut("expired");
    expect(frame.sent("busymate.identity.v1.revoked").map((m) => m.reason)).toEqual(["signed_out", "signed_out", "signed_out", "expired"]);
  });

  it("refreshIdentity() is identityChanged()", async () => {
    const getIdentity = vi.fn(async ({ nonce }: { nonce: string }) => ({ token: "t", nonce }));
    chat = createBusymateChat({ assistant: "acme", getIdentity });
    chat.mount();
    fakeFrame();
    await expect(chat.refreshIdentity()).resolves.toBe(true);
    expect(getIdentity.mock.calls[0]![0]).toMatchObject({ reason: "changed" });
  });
});

describe("page tools", () => {
  it("is a lazy import from the chat origin: nothing loads at mount, registration passes exposedTo", async () => {
    chat = createBusymateChat({ assistant: "acme" });
    chat.mount();
    expect(document.querySelector('link[rel="modulepreload"]')).toBeNull();
    // happy-dom cannot import a remote module: the failure names the exact runtime URL.
    await expect(chat.registerPageTools([])).rejects.toBeTruthy();
    expect(document.querySelector<HTMLLinkElement>('link[rel="modulepreload"]')?.href).toBe(ORIGIN + PAGE_TOOLS_PATH);
  });

  it("csp adds the chat origin to script-src only when page tools are used", () => {
    expect(cspDirectives({ assistant: "acme" })["script-src"]).toBeUndefined();
    expect(cspDirectives({ assistant: "acme", pageTools: true })["script-src"]).toEqual([ORIGIN]);
  });
});
