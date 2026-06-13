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
  // --- Agent runtime (Phase 9) ------------------------------------------
  /** Renderer -> main (invoke): list session metadata. */
  agentListSessions: "meith:agent:sessions:list",
  /** Renderer -> main (invoke): get a full session (with transcript). */
  agentGetSession: "meith:agent:session:get",
  /** Renderer -> main (invoke): create a session. */
  agentCreateSession: "meith:agent:session:create",
  /** Renderer -> main (invoke): delete a session. */
  agentDeleteSession: "meith:agent:session:delete",
  /** Renderer -> main (invoke): start a run (returns when the turn ends). */
  agentSendMessage: "meith:agent:message:send",
  /** Renderer -> main (invoke): cancel a running session. */
  agentCancel: "meith:agent:cancel",
  /** Renderer -> main (invoke): resolve a pending permission request. */
  agentPermissionDecision: "meith:agent:permission:decision",
  /** Renderer -> main (invoke): read agent config. */
  agentGetConfig: "meith:agent:config:get",
  /** Renderer -> main (invoke): update agent config. */
  agentSetConfig: "meith:agent:config:set",
  /** Main -> renderer: a streamed chunk `{ sessionId, chunk }`. */
  agentChunk: "meith:agent:chunk",
  /** Main -> renderer: session metadata changed (status/usage/title). */
  agentSession: "meith:agent:session",
  /** Main -> renderer: a pending permission request to render a card for. */
  agentPermission: "meith:agent:permission",
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

  // --- Agent runtime -----------------------------------------------------
  // Lifecycle + queries are request/response; the high-rate run output and
  // permission prompts use dedicated push channels (like terminals).
  ipcMain.handle(IPC.agentListSessions, () => container.agents.listSessions());
  ipcMain.handle(
    IPC.agentGetSession,
    (_e, id: string) => container.agents.getSession(id) ?? null,
  );
  ipcMain.handle(
    IPC.agentCreateSession,
    (
      _e,
      input: { cwd: string; spaceId?: string | null; title?: string; model?: string },
    ) => container.agents.createSession(input),
  );
  ipcMain.handle(IPC.agentDeleteSession, (_e, id: string) =>
    container.agents.deleteSession(id),
  );
  ipcMain.handle(IPC.agentSendMessage, async (_e, sessionId: string, text?: string) => {
    // Drain the run to completion; chunks are pushed via IPC.agentChunk as
    // they arrive. Returns the final session so the renderer can reconcile.
    for await (const _chunk of container.agents.run(sessionId, text)) {
      void _chunk;
    }
    return container.agents.getSession(sessionId) ?? null;
  });
  ipcMain.handle(IPC.agentCancel, (_e, id: string) => {
    container.agents.cancel(id);
    return true;
  });
  ipcMain.handle(
    IPC.agentPermissionDecision,
    (
      _e,
      decision: {
        sessionId: string;
        toolCallId: string;
        decision: "allow" | "deny";
        remember?: boolean;
      },
    ) => {
      container.agents.permissionDecision({
        remember: false,
        ...decision,
      });
      return true;
    },
  );
  ipcMain.handle(IPC.agentGetConfig, () => container.agents.getConfig());
  ipcMain.handle(IPC.agentSetConfig, (_e, patch: Record<string, unknown>) =>
    container.agents.setConfig(patch),
  );

  // Push agent run output, session metadata changes, and permission prompts.
  container.agents.on("chunk", (evt) => {
    getWindow()?.webContents.send(IPC.agentChunk, evt);
  });
  container.agents.on("session", (meta) => {
    getWindow()?.webContents.send(IPC.agentSession, meta);
  });
  container.agents.on("permission", (req) => {
    getWindow()?.webContents.send(IPC.agentPermission, req);
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
