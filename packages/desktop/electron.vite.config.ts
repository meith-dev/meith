import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
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
        // Preloads run with `sandbox: true`, which requires CommonJS (ESM
        // preloads are unsupported in sandboxed contexts). Because the package
        // is `"type": "module"`, CommonJS output must use the `.cjs` extension
        // so Electron/Node treat it as CJS. The main process references these
        // as `index.cjs` / `webContent.cjs`.
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": resolve(__dirname, "src/renderer/src") },
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
  },
});
