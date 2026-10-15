import { defineConfig } from "vite";

// No React plugin needed: Vite's built-in transform handles JSX with the automatic runtime.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
});
