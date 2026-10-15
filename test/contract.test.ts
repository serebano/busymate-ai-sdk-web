// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as wire from "../src/wire.js";
import { SDK_VERSION } from "../src/version.js";

const contract = JSON.parse(readFileSync(new URL("../contract.json", import.meta.url), "utf8"));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const prose = readFileSync(new URL("../CONTRACT-v1.md", import.meta.url), "utf8");

describe("contract.json is the wire the code speaks", () => {
  it("names the same bridge, channel, versions and host class", () => {
    expect(contract.version).toBe(wire.CONTRACT_VERSION);
    expect(contract.bridge).toBe(wire.BRIDGE_MARKER);
    expect(contract.channel).toBe(wire.EMBED_CHANNEL);
    expect(contract.identityContract).toBe(wire.IDENTITY_CONTRACT);
    expect(contract.hostClass).toBe(wire.HOST_CLASS);
    expect(contract.frame.iframe).toEqual({ sandbox: wire.IFRAME_SANDBOX, allow: wire.IFRAME_ALLOW, referrerPolicy: wire.IFRAME_REFERRER_POLICY });
  });

  it("lists exactly the message types in both directions", () => {
    expect(Object.keys(contract.frameToHost).sort()).toEqual(Object.values(wire.FRAME_MESSAGE).sort());
    expect(Object.keys(contract.hostToFrame).sort()).toEqual(Object.values(wire.HOST_MESSAGE).sort());
  });

  it("lists the same reason vocabularies", () => {
    expect(contract.reasons.ask).toEqual([...wire.IDENTITY_ASK_REASONS]);
    expect(contract.reasons.revoke).toEqual([...wire.REVOKE_REASONS]);
    expect(contract.reasons.unavailable).toEqual([...wire.UNAVAILABLE_REASONS]);
  });

  it("CONTRACT-v1.md documents every message type and link reason", () => {
    for (const type of [...Object.keys(contract.frameToHost), ...Object.keys(contract.hostToFrame)]) expect(prose).toContain("`" + type + "`");
    for (const reason of contract.linkStatus.sdkReasons) expect(prose).toContain("`" + reason + "`");
  });

  it("the package and code agree on the version", () => {
    expect(pkg.version).toBe(SDK_VERSION);
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  });
});
