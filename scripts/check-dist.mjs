// Checks the built package the way an integrator consumes it:
//  - zero runtime dependencies;
//  - the ESM and CommonJS builds import under plain Node (no DOM: the SSR case)
//    and expose the same API;
//  - the script-tag build defines `window.BusymateAIWeb` and nothing else global;
//  - every build reports the package version.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const fail = (message) => {
  console.error("check-dist:", message);
  process.exit(1);
};

if (Object.keys(pkg.dependencies ?? {}).length) fail("runtime dependencies are not allowed");

const esm = await import(new URL("dist/index.js", root).href);
const cjs = createRequire(import.meta.url)("../dist/index.cjs");
for (const [name, mod] of [["esm", esm], ["cjs", cjs]]) {
  if (mod.SDK_VERSION !== pkg.version) fail(`${name} SDK_VERSION ${mod.SDK_VERSION} != ${pkg.version}`);
  if (typeof mod.createBusymateChat !== "function") fail(`${name} has no createBusymateChat`);
  const chat = mod.createBusymateChat({ assistant: "acme" });
  if (chat.mount() !== false) fail(`${name} mount() must be a no-op without a DOM`);
}
const esmKeys = Object.keys(esm).sort().join(",");
const cjsKeys = Object.keys(cjs).sort().join(",");
if (esmKeys !== cjsKeys) fail(`esm and cjs exports differ:\n${esmKeys}\n${cjsKeys}`);

const iife = readFileSync(new URL("dist/busymate-ai-web.iife.js", root), "utf8");
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(iife, sandbox);
const globals = Object.keys(sandbox).filter((k) => !["console", "window"].includes(k));
if (globals.join(",") !== "BusymateAIWeb") fail(`the script-tag build defines unexpected globals: ${globals.join(",")}`);
if (sandbox.BusymateAIWeb.SDK_VERSION !== pkg.version) fail("iife version mismatch");
if (Object.keys(sandbox.BusymateAIWeb).sort().join(",") !== esmKeys) fail("iife exports differ from esm");
console.log(`check-dist: ${pkg.name} ${pkg.version} ok (esm, cjs, iife; ${Object.keys(esm).length} exports, 0 runtime deps)`);
