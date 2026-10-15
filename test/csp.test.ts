import { describe, expect, it } from "vitest";
import { cspDirectives, cspHeader, IFRAME_POLICY, parseExactOrigin } from "../src/index.js";

describe("CSP and iframe guidance", () => {
  it("lists exactly the chat origin, plus a separate mint and script origin", () => {
    expect(cspDirectives({ origin: "https://help.acme.com", mintOrigin: "https://api.acme.com", scriptOrigin: "https://cdn.acme.com" })).toEqual({
      "frame-src": ["https://help.acme.com"],
      "connect-src": ["https://help.acme.com", "https://api.acme.com"],
      "script-src": ["https://cdn.acme.com"],
    });
    expect(cspHeader({ assistant: "acme" })).toBe("frame-src https://acme.busymate.ai; connect-src https://acme.busymate.ai");
    expect(() => cspDirectives({})).toThrow();
  });

  it("pins the iframe sandbox and permissions", () => {
    expect(IFRAME_POLICY).toEqual({ sandbox: "allow-scripts allow-forms allow-same-origin", allow: "tools; microphone; autoplay" });
  });

  it("accepts only exact origins", () => {
    expect(parseExactOrigin("https://acme.busymate.ai")).toBe("https://acme.busymate.ai");
    expect(parseExactOrigin("https://acme.busymate.ai/")).toBe("https://acme.busymate.ai");
    expect(parseExactOrigin("https://acme.busymate.ai:8443")).toBe("https://acme.busymate.ai:8443");
    expect(parseExactOrigin("http://localhost:5173")).toBe("http://localhost:5173");
    for (const bad of ["http://acme.com", "https://*.acme.com", "https://acme.com/path", "https://u:p@acme.com", "https://acme.com?x=1", "", 42]) {
      expect(parseExactOrigin(bad)).toBeNull();
    }
  });
});
