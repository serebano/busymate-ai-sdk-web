import { defineConfig } from "tsup";

export default defineConfig([
  {
    // Bundlers and Node (SSR imports): ESM + CommonJS with types.
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    platform: "browser",
    target: "es2020",
    outDir: "dist",
    treeshake: true,
  },
  {
    // Script-tag users: one self-contained file that defines `window.BusymateAIWeb`.
    entry: { "busymate-ai-web": "src/index.ts" },
    format: ["iife"],
    globalName: "BusymateAIWeb",
    platform: "browser",
    target: "es2020",
    minify: true,
    outDir: "dist",
    outExtension: () => ({ js: ".iife.js" }),
  },
]);
