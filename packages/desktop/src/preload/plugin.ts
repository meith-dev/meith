import type {
  MeithPluginAiStreamOptions,
  MeithPluginAiStreamResult,
  MeithPluginIdentity,
  ToolDescriptor,
} from "@meith/protocol";
import type { BrowserTab, ToolResult, WorkspaceTab } from "@meith/shared";
import { contextBridge, ipcRenderer } from "electron";
import { type PluginApiTransport, buildPluginApiShape } from "./pluginApiShape.js";

/**
 * Preload for meith PLUGIN tabs (mode: "plugin").
 *
 * Unlike the ordinary web-content preload, this exposes a narrow, permission-
 * gated `window.meithPlugin` bridge. Crucially, identity and the approved
 * grants are resolved authoritatively by the MAIN process from the sending
 * webContents id — the page (and even the manifest-supplied id passed via
 * `additionalArguments`) is never trusted here. If the main process does not
 * recognize this webContents as an enabled plugin, identity is null and NOTHING
 * is exposed, so a normal tab can never gain plugin APIs.
 */

// Channel literals duplicated to avoid importing main-process code into the
// sandboxed preload bundle. Keep in sync with main/ipc/handlers.ts.
const IPC = {
  identity: "meith:plugin:identity",
  toolsList: "meith:plugin:tools:list",
  toolsCall: "meith:plugin:tools:call",
  storageBrowserTabs: "meith:plugin:storage:browserTabs",
  storageWorkspaceTabs: "meith:plugin:storage:workspaceTabs",
  cdp: "meith:plugin:cdp",
  aiStart: "meith:plugin:ai:start",
  aiCancel: "meith:plugin:ai:cancel",
  aiChunk: "meith:plugin:ai:chunk",
} as const;

/** A streamed AI chunk forwarded from the main process for a specific call. */
type AiChunk =
  | { callId: string; type: "text"; delta: string }
  | { callId: string; type: "done" }
  | { callId: string; type: "error"; message: string };

let aiCallSeq = 0;

const transport: PluginApiTransport = {
  toolsList: () => ipcRenderer.invoke(IPC.toolsList) as Promise<ToolDescriptor[]>,
  toolsCall: (name, args) =>
    ipcRenderer.invoke(IPC.toolsCall, name, args) as Promise<ToolResult>,
  storageBrowserTabs: () =>
    ipcRenderer.invoke(IPC.storageBrowserTabs) as Promise<BrowserTab[]>,
  storageWorkspaceTabs: () =>
    ipcRenderer.invoke(IPC.storageWorkspaceTabs) as Promise<WorkspaceTab[]>,
  cdpSend: (tabId, method, params) =>
    ipcRenderer.invoke(IPC.cdp, tabId, method, params) as Promise<ToolResult>,
  aiStreamText: (options: MeithPluginAiStreamOptions) => streamText(options),
};

/**
 * Drive an `ai.streamText` call: start it in main, forward text deltas to
 * `onText`, hand the caller a `cancel()` handle via `onStart`, and resolve with
 * the full text on completion (or reject on error/cancel).
 */
function streamText(
  options: MeithPluginAiStreamOptions,
): Promise<MeithPluginAiStreamResult> {
  const callId = `pai_${++aiCallSeq}_${Date.now()}`;
  let full = "";
  let settled = false;

  return new Promise<MeithPluginAiStreamResult>((resolve, reject) => {
    const listener = (_e: unknown, chunk: AiChunk) => {
      if (chunk.callId !== callId || settled) return;
      if (chunk.type === "text") {
        full += chunk.delta;
        try {
          options.onText?.(chunk.delta);
        } catch {
          // A throwing consumer callback must not break the stream.
        }
      } else if (chunk.type === "done") {
        settled = true;
        cleanup();
        resolve({ text: full });
      } else {
        settled = true;
        cleanup();
        reject(new Error(chunk.message));
      }
    };
    const cleanup = () => ipcRenderer.removeListener(IPC.aiChunk, listener);

    ipcRenderer.on(IPC.aiChunk, listener);

    const cancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      ipcRenderer.send(IPC.aiCancel, { callId });
      reject(new Error("cancelled"));
    };
    try {
      options.onStart?.({ cancel });
    } catch {
      // Ignore a throwing onStart; cancellation simply won't be wired.
    }

    ipcRenderer.send(IPC.aiStart, { callId, prompt: options.prompt });
  });
}

// Resolve identity synchronously at preload init. Main returns null for any
// webContents it does not recognize as an enabled plugin.
const identity = (ipcRenderer.sendSync(IPC.identity) ??
  null) as MeithPluginIdentity | null;

const api = buildPluginApiShape(identity, transport);

if (api) {
  contextBridge.exposeInMainWorld("meithPlugin", api);
}
