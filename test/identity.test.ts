import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBusymateChat, IdentityError, type BusymateChat, type IdentityRequest, type LinkStatus } from "../src/index.js";
import { VERIFY_GRACE_MS } from "../src/identity.js";
import { cleanup, fakeFrame, flush } from "./fakeFrame.js";

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
  history.replaceState(null, "", "/products/42");
});

function statuses(c: BusymateChat): LinkStatus[] {
  const list: LinkStatus[] = [];
  c.onLinkStatus((s) => list.push(s));
  return list;
}

const ask = { type: "busymate.ai.v1.identity_request", v: 1, reason: "launch" };

describe("answering the chat's identity ask", () => {
  it("mints through the provider with a fresh nonce and answers with the token", async () => {
    const getIdentity = vi.fn(async ({ nonce }: IdentityRequest) => ({ token: "jwt-1", nonce }));
    chat = createBusymateChat({ assistant: "acme", getIdentity });
    const seen = statuses(chat);
    chat.mount();
    const frame = fakeFrame();
    frame.say({ ...ask, deadlineAt: Date.now() + 2_000 });
    await vi.waitFor(() => expect(frame.sent("busymate.ai.v1.identity")).toHaveLength(1));
    const [request] = getIdentity.mock.calls[0]!;
    expect(request.reason).toBe("launch");
    expect(request.nonce).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(frame.sent("busymate.ai.v1.identity")[0]).toEqual({ type: "busymate.ai.v1.identity", token: "jwt-1", nonce: request.nonce, hc: "web-configure" });
    frame.say({ type: "busymate.ai.v1.ready", visitorKind: "identified", displayClaims: { name: "Ada" } });
    expect(seen.map((s) => `${s.state}:${s.reason}`)).toEqual(["unlinked:anonymous", "linking:identity_requested", "linking:identity_offered", "linked:identified"]);
    expect(chat.linkStatus.source).toBe("frame");
  });

  it("signed out (null) answers unavailable not_signed_in", async () => {
    chat = createBusymateChat({ assistant: "acme", getIdentity: async () => null });
    chat.mount();
    const frame = fakeFrame();
    frame.say(ask);
    await vi.waitFor(() => expect(frame.sent("busymate.identity.v1.unavailable")).toHaveLength(1));
    expect(frame.sent("busymate.identity.v1.unavailable")[0]).toMatchObject({ v: 1, reason: "not_signed_in" });
    expect(chat.linkStatus).toMatchObject({ state: "unlinked", reason: "not_signed_in" });
  });

  it("a failed mint answers mint_failed and keeps the chat working", async () => {
    chat = createBusymateChat({ assistant: "acme", getIdentity: async () => { throw new Error("HTTP 500"); } });
    chat.mount();
    const frame = fakeFrame();
    frame.say(ask);
    await vi.waitFor(() => expect(frame.sent("busymate.identity.v1.unavailable")).toHaveLength(1));
    expect(frame.sent("busymate.identity.v1.unavailable")[0]).toMatchObject({ reason: "mint_failed" });
    expect(chat.linkStatus).toMatchObject({ state: "failed", reason: "mint_failed", detail: "HTTP 500" });
  });

  it("a provider error code becomes the reason (nonce_mismatch)", async () => {
    chat = createBusymateChat({ assistant: "acme", getIdentity: async () => { throw new IdentityError("nonce_mismatch"); } });
    chat.mount();
    const frame = fakeFrame();
    frame.say(ask);
    await vi.waitFor(() => expect(chat!.linkStatus.reason).toBe("nonce_mismatch"));
    expect(chat.linkStatus.state).toBe("failed");
  });

  it("a malformed answer is invalid_identity", async () => {
    chat = createBusymateChat({ assistant: "acme", getIdentity: async () => ({ token: "" }) as never });
    chat.mount();
    const frame = fakeFrame();
    frame.say(ask);
    await vi.waitFor(() => expect(chat!.linkStatus.reason).toBe("invalid_identity"));
  });

  it("a slow provider: the chat continues (unsupported) and the late identity upgrades in place", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let resolve!: (v: { token: string; nonce: string }) => void;
    chat = createBusymateChat({ assistant: "acme", getIdentity: () => new Promise((r) => (resolve = r)) });
    chat.mount();
    const frame = fakeFrame();
    frame.say({ ...ask, deadlineAt: Date.now() + 2_000 });
    await flush();
    vi.advanceTimersByTime(1_500);
    expect(frame.sent("busymate.identity.v1.unavailable")[0]).toMatchObject({ reason: "unsupported" });
    frame.say({ type: "busymate.ai.v1.ready", visitorKind: "anonymous" });
    resolve({ token: "late-jwt", nonce: "n" });
    await flush(10);
    expect(frame.sent("busymate.ai.v1.identity")[0]).toMatchObject({ token: "late-jwt" });
    frame.say({ type: "busymate.ai.v1.ready", visitorKind: "identified" });
    expect(chat.linkStatus).toMatchObject({ state: "linked", reason: "identified" });
  });

  it("an ask before any provider is parked and answered once one is set", async () => {
    chat = createBusymateChat({ assistant: "acme" });
    chat.mount();
    const frame = fakeFrame();
    frame.say({ type: "busymate.ai.v1.ready", visitorKind: "anonymous" });
    frame.say(ask);
    expect(chat.linkStatus).toMatchObject({ state: "unlinked", reason: "no_provider" });
    // A guest page answers quickly instead of letting the chat wait out its deadline.
    await vi.waitFor(() => expect(frame.sent("busymate.identity.v1.unavailable")[0]).toMatchObject({ reason: "not_signed_in" }));
    chat.setIdentityProvider(async ({ nonce }) => ({ token: "jwt-2", nonce }));
    await vi.waitFor(() => expect(frame.sent("busymate.ai.v1.identity")).toHaveLength(1));
  });

  it("an offered identity that never verifies is reported not_verified", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    chat = createBusymateChat({ assistant: "acme", getIdentity: async ({ nonce }) => ({ token: "bad-claims", nonce }) });
    chat.mount();
    const frame = fakeFrame();
    frame.say(ask);
    await flush(10);
    frame.say({ type: "busymate.ai.v1.ready", visitorKind: "anonymous" });
    expect(chat.linkStatus.state).toBe("linking");
    vi.advanceTimersByTime(VERIFY_GRACE_MS + 1);
    expect(chat.linkStatus).toMatchObject({ state: "failed", reason: "not_verified" });
  });

  it("reason codes from the hosted chat's ack pass through as stable strings", () => {
    chat = createBusymateChat({ assistant: "acme" });
    chat.mount();
    const frame = fakeFrame();
    frame.say({ type: "busymate.identity.v1.ack", v: 1, outcome: "rejected:clock_skew" });
    expect(chat.linkStatus).toMatchObject({ state: "failed", reason: "clock_skew", source: "frame", detail: "rejected:clock_skew" });
    frame.say({ type: "busymate.identity.v1.ack", v: 1, outcome: "identified" });
    expect(chat.linkStatus).toMatchObject({ state: "linked", reason: "identified" });
  });
});

describe("identity from your page", () => {
  it("identify() offers in place once the frame is ready; the same token twice is a no-op", () => {
    chat = createBusymateChat({ assistant: "acme" });
    chat.mount();
    const frame = fakeFrame();
    expect(chat.identify({ token: "t1", nonce: "n1" })).toBe(true);
    expect(chat.identify({ token: "t1", nonce: "n1" })).toBe(true);
    expect(chat.identify({ token: "", nonce: "" } as never)).toBe(false);
    frame.say({ type: "busymate.ai.v1.ready", visitorKind: "anonymous" });
    expect(frame.sent("busymate.ai.v1.identity")).toEqual([{ type: "busymate.ai.v1.identity", token: "t1", nonce: "n1", hc: "web-configure" }]);
  });

  it("identify() before mount launches the frame identified (fragment, never the query)", () => {
    chat = createBusymateChat({ assistant: "acme" });
    chat.setUser({ token: "pre-mount", nonce: "nn" });
    chat.mount();
    const src = new URL(document.querySelector("iframe")!.src);
    const fragment = new URLSearchParams(src.hash.slice(1));
    expect(fragment.get("bmai_token")).toBe("pre-mount");
    expect(fragment.get("bmai_nonce")).toBe("nn");
    expect(src.search).not.toContain("pre-mount");
    expect(chat.linkStatus).toMatchObject({ state: "linking", reason: "identity_offered" });
  });

  it("consumes the sign-in return fragment and cleans the page URL", () => {
    history.replaceState(null, "", "/account?tab=1#bmai_token=ret-jwt&bmai_nonce=ret-n&keep=1");
    chat = createBusymateChat({ assistant: "acme" });
    chat.mount();
    expect(location.hash).toBe("#keep=1");
    expect(location.search).toBe("?tab=1");
    const fragment = new URLSearchParams(new URL(document.querySelector("iframe")!.src).hash.slice(1));
    expect(fragment.get("bmai_token")).toBe("ret-jwt");
  });

  it("logout() withdraws the identity; setUser(null) is the same", () => {
    chat = createBusymateChat({ assistant: "acme" });
    chat.mount();
    const frame = fakeFrame();
    frame.say({ type: "busymate.ai.v1.ready", visitorKind: "identified" });
    chat.logout();
    chat.setUser(null);
    chat.logout("expired");
    expect(frame.sent("busymate.identity.v1.revoked")).toEqual([
      { type: "busymate.identity.v1.revoked", v: 1, reason: "signed_out" },
      { type: "busymate.identity.v1.revoked", v: 1, reason: "signed_out" },
      { type: "busymate.identity.v1.revoked", v: 1, reason: "expired" },
    ]);
    expect(chat.linkStatus).toMatchObject({ state: "unlinked", reason: "expired" });
  });

  it("switchAccount() withdraws first, then links the next person", async () => {
    chat = createBusymateChat({ assistant: "acme", getIdentity: async ({ nonce }) => ({ token: "next-person", nonce }) });
    chat.mount();
    const frame = fakeFrame();
    frame.say({ type: "busymate.ai.v1.ready", visitorKind: "identified" });
    await expect(chat.switchAccount()).resolves.toBe(true);
    const types = frame.posts.map(([m]) => m.type).filter((t) => String(t).startsWith("busymate.identity") || t === "busymate.ai.v1.identity");
    expect(types).toEqual(["busymate.identity.v1.revoked", "busymate.ai.v1.identity"]);
    expect(frame.sent("busymate.identity.v1.revoked")[0]).toMatchObject({ reason: "switched" });
  });

  it("identityChanged() re-asks the provider; null tells the chat not_signed_in", async () => {
    let signedIn = true;
    chat = createBusymateChat({ assistant: "acme", getIdentity: async ({ nonce }) => (signedIn ? { token: "rotated", nonce } : null) });
    chat.mount();
    const frame = fakeFrame();
    frame.say({ type: "busymate.ai.v1.ready", visitorKind: "anonymous" });
    await expect(chat.identityChanged()).resolves.toBe(true);
    expect(frame.sent("busymate.ai.v1.identity")[0]).toMatchObject({ token: "rotated" });
    signedIn = false;
    await expect(chat.identityChanged()).resolves.toBe(false);
    expect(frame.sent("busymate.identity.v1.unavailable")[0]).toMatchObject({ reason: "not_signed_in" });
  });

  it("an account() change between asks withdraws the previous person before answering", async () => {
    let account: string | null = "user-a";
    chat = createBusymateChat({ assistant: "acme", account: () => account, getIdentity: async ({ nonce }) => ({ token: "for-" + account, nonce }) });
    chat.mount();
    const frame = fakeFrame();
    frame.say({ type: "busymate.ai.v1.ready", visitorKind: "identified" });
    frame.say(ask);
    await vi.waitFor(() => expect(frame.sent("busymate.ai.v1.identity")).toHaveLength(1));
    account = "user-b";
    frame.say({ ...ask, reason: "resume" });
    await vi.waitFor(() => expect(frame.sent("busymate.ai.v1.identity")).toHaveLength(2));
    expect(frame.sent("busymate.identity.v1.revoked")[0]).toMatchObject({ reason: "switched" });
    account = null;
    frame.say({ ...ask, reason: "resume" });
    await vi.waitFor(() => expect(frame.sent("busymate.identity.v1.revoked")).toHaveLength(2));
    expect(frame.sent("busymate.identity.v1.revoked")[1]).toMatchObject({ reason: "signed_out" });
    expect(frame.sent("busymate.identity.v1.unavailable").at(-1)).toMatchObject({ reason: "not_signed_in" });
  });
});
