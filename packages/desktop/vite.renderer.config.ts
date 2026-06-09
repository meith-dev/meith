import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * Standalone Vite config for running ONLY the renderer in a normal browser.
 * Useful for UI development / previews where Electron can't launch (e.g. CI or
 * a headless sandbox). The renderer falls back to a mock bridge when the
 * Electron preload API (`window.meith`) is not present.
 */
export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/renderer/src"),
      "@meith/protocol": resolve(__dirname, "../protocol/src/index.ts"),
      "@meith/shared": resolve(__dirname, "../shared/src/index.ts"),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
