// @vitest-environment node
import { describe, expect, it } from "vitest";

describe("SSR-safe import", () => {
  it("imports and creates a chat with no DOM; mount is a no-op", async () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe("undefined");
    const sdk = await import("../src/index.js");
    const chat = sdk.createBusymateChat({ assistant: "acme", getIdentity: async () => null });
    expect(chat.mount()).toBe(false);
    expect(chat.mounted).toBe(false);
    expect(chat.isOpen()).toBe(false);
    expect(chat.ask("hi")).toBe(true); // queued for a later mount, nothing thrown
    expect(chat.frameUrl()).toBeNull();
    expect(chat.linkStatus).toMatchObject({ state: "unlinked", reason: "anonymous" });
    chat.unmount();
    expect(sdk.cspHeader({ assistant: "acme" })).toBe("frame-src https://acme.busymate.ai; connect-src https://acme.busymate.ai");
  });
});
