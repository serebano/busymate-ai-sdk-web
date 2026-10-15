import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "happy-dom",
    environmentOptions: {
      happyDOM: {
        url: "https://shop.example.com/products/42",
        // Unit tests never load the hosted chat: frames are driven by test/fakeFrame.ts.
        settings: { navigation: { disableChildFrameNavigation: true }, disableJavaScriptFileLoading: true, disableCSSFileLoading: true },
      },
    },
  },
});
