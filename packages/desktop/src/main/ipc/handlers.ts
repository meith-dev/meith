import type { ToolContext } from "@meith/shared";
import { type BrowserWindow, dialog, ipcMain } from "electron";
import type { ServiceContainer } from "../bootstrap.js";

/**
 * IPC channel names shared with the preload bridge. Keep in sync with
 * `src/preload/index.ts`.
 */
export const IPC = {
  toolsList: "meith:tools:list",
  toolCall: "meith:tools:call",
  getState: "meith:state:get",
  stateChanged: "meith:state:changed",
  getLogs: "meith:logs:get",
  logEntry: "meith:logs:entry",
  /** Renderer -> main (one-way): measured browser content viewport bounds. */
  browserViewport: "meith:browser:viewport",
  /** Main -> renderer: a chunk of terminal output `{ id, chunk }`. */
  terminalData: "meith:terminal:data",
  /** Main -> renderer: a terminal exited `{ id, exitCode, signal }`. */
  terminalExit: "meith:terminal:exit",
  /** Renderer -> main (invoke): show a native "open folder" picker. */
  dialogOpenFolder: "meith:dialog:openFolder",
} as const;

/**
 * Register IPC handlers so the renderer can use the SAME tool registry and
 * state service as the CLI/socket. The renderer never reaches services
 * directly — it goes through these handlers, mirroring the socket protocol.
 */
export function registerIpcHandlers(
  container: ServiceContainer,
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle(IPC.toolsList, () => container.registry.describe());

  ipcMain.handle(
    IPC.toolCall,
    async (_event, name: string, args: Record<string, unknown>) => {
      const ctx: Omit<ToolContext, "signal" | "emit"> = {
        cwd: process.cwd(),
        caller: "renderer",
      };
      return container.registry.call(ctx, name, args ?? {});
    },
  );

  ipcMain.handle(IPC.getState, () => container.appState.getState());
  ipcMain.handle(IPC.getLogs, (_event, limit?: number) => container.logger.list(limit));

  // Native "open folder" picker. The renderer uses the returned path to open a
  // project (which creates a space named after the folder).
  ipcMain.handle(IPC.dialogOpenFolder, async () => {
    const win = getWindow();
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ["openDirectory"] })
      : await dialog.showOpenDialog({ properties: ["openDirectory"] });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Push state changes and new log entries to the renderer.
  container.appState.on("change", (state) => {
    getWindow()?.webContents.send(IPC.stateChanged, state);
  });
  container.logger.on("entry", (entry) => {
    getWindow()?.webContents.send(IPC.logEntry, entry);
  });

  // Stream live terminal output/exit to the renderer so the xterm.js component
  // can render PTY data in real time. Lifecycle (create/write/resize/kill) goes
  // through the normal tool-call path; only the high-rate output stream needs a
  // dedicated push channel.
  container.terminals.on("data", (evt) => {
    getWindow()?.webContents.send(IPC.terminalData, evt);
  });
  container.terminals.on("exit", (evt) => {
    getWindow()?.webContents.send(IPC.terminalExit, evt);
  });
}
