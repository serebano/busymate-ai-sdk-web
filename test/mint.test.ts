import { describe, expect, it, vi } from "vitest";
import { mintFromEndpoint } from "../src/index.js";

function fakeFetch(status: number, body: unknown) {
  const f = vi.fn(async (_url: string, _init: RequestInit) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  return f as typeof f & typeof fetch;
}

describe("mintFromEndpoint", () => {
  it("POSTs the nonce and returnTo with cookies, no cache and no redirects", async () => {
    const f = fakeFetch(201, { token: "jwt", nonce: "abc", expiresIn: 120 });
    const provider = mintFromEndpoint("https://shop.example.com/api/bmai/identity", { fetch: f, headers: { "x-csrf": "1" } });
    await expect(provider({ nonce: "abc", reason: "launch" })).resolves.toEqual({ token: "jwt", nonce: "abc" });
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("https://shop.example.com/api/bmai/identity");
    expect(init).toMatchObject({ method: "POST", credentials: "include", cache: "no-store", redirect: "error" });
    expect(JSON.parse(String(init.body))).toEqual({ nonce: "abc", returnTo: "https://shop.example.com/products/42" });
    expect((init.headers as Record<string, string>)["x-csrf"]).toBe("1");
  });

  it("401/403 is signed out; no access token makes no request", async () => {
    await expect(mintFromEndpoint("/api/bmai/identity", { fetch: fakeFetch(401, {}) })({ nonce: "n", reason: "launch" })).resolves.toBeNull();
    await expect(mintFromEndpoint("/api/bmai/identity", { fetch: fakeFetch(403, {}) })({ nonce: "n", reason: "launch" })).resolves.toBeNull();
    const f = fakeFetch(201, {});
    await expect(mintFromEndpoint("/api/bmai/identity", { fetch: f, getAccessToken: () => null })({ nonce: "n", reason: "launch" })).resolves.toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("sends the bearer token from your auth", async () => {
    const f = fakeFetch(201, { token: "jwt", nonce: "n" });
    await mintFromEndpoint("/api/bmai/identity", { fetch: f, getAccessToken: async () => "access-1" })({ nonce: "n", reason: "launch" });
    expect((f.mock.calls[0]![1].headers as Record<string, string>).authorization).toBe("Bearer access-1");
  });

  it("names every failure", async () => {
    await expect(mintFromEndpoint("/x", { fetch: fakeFetch(500, {}) })({ nonce: "n", reason: "launch" })).rejects.toMatchObject({ code: "mint_failed" });
    await expect(mintFromEndpoint("/x", { fetch: fakeFetch(200, "not json") })({ nonce: "n", reason: "launch" })).rejects.toMatchObject({ code: "invalid_identity" });
    await expect(mintFromEndpoint("/x", { fetch: fakeFetch(200, { nonce: "n" }) })({ nonce: "n", reason: "launch" })).rejects.toMatchObject({ code: "invalid_identity" });
    await expect(mintFromEndpoint("/x", { fetch: fakeFetch(200, { token: "t", nonce: "other" }) })({ nonce: "n", reason: "launch" })).rejects.toMatchObject({ code: "nonce_mismatch" });
    const offline = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    await expect(mintFromEndpoint("/x", { fetch: offline as never })({ nonce: "n", reason: "launch" })).rejects.toMatchObject({ code: "mint_failed" });
  });

  it("refuses a non-https endpoint (localhost http is allowed for development)", () => {
    expect(() => mintFromEndpoint("http://shop.example.com/api")).toThrow(/https/);
    expect(() => mintFromEndpoint("http://localhost:3000/api")).not.toThrow();
  });
});
