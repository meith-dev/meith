import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: resolve(__dirname, "src/main/index.ts") },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        // Two preload bundles: the app renderer bridge (index) and the safe
        // bridge applied to ordinary browser-tab web content (webContent).
        entry: {
          index: resolve(__dirname, "src/preload/index.ts"),
          webContent: resolve(__dirname, "src/preload/webContent.ts"),
        },
      },
      rollupOptions: {
        // Keep `.js` filenames so main-process require paths stay stable
        // (multi-entry libs would otherwise emit `.mjs`).
        output: { entryFileNames: "[name].js" },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
  },
});
