import { ipcMain, type BrowserWindow } from "electron";
import type { ToolContext } from "@meith/shared";
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
      const ctx: ToolContext = { cwd: process.cwd(), caller: "renderer" };
      return container.registry.call(ctx, name, args ?? {});
    },
  );

  ipcMain.handle(IPC.getState, () => container.appState.getState());
  ipcMain.handle(IPC.getLogs, (_event, limit?: number) =>
    container.logger.list(limit),
  );

  // Push state changes and new log entries to the renderer.
  container.appState.on("change", (state) => {
    getWindow()?.webContents.send(IPC.stateChanged, state);
  });
  container.logger.on("entry", (entry) => {
    getWindow()?.webContents.send(IPC.logEntry, entry);
  });
}
