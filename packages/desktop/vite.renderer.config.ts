import { resolve } from "node:path";
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
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
});
