import { contextBridge, ipcRenderer } from "electron";

/**
 * Preload for ordinary browser-tab web content (NOT the app renderer).
 *
 * Web content runs sandboxed with no Node integration. We expose only a tiny,
 * explicitly-allowlisted message bridge so a page can post structured messages
 * up to the main process (e.g. automation hooks) without gaining any ambient
 * Node/Electron capability. There is intentionally no `require`, no `fs`, and
 * no arbitrary IPC surface here.
 */
const CHANNEL = "meith:web-content:message";

contextBridge.exposeInMainWorld("__meith", {
  /** Post a JSON-serializable message to the host. */
  postMessage(message: unknown): void {
    // Structured-clone enforced by Electron; non-serializable payloads throw.
    ipcRenderer.send(CHANNEL, message);
  },
});
