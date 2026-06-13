import type { MeithPluginIdentity } from "@meith/protocol";
import { type ToolContext, errorResult } from "@meith/shared";
import { type BrowserWindow, dialog, ipcMain } from "electron";
import type { ServiceContainer } from "../bootstrap.js";
import { PluginError } from "../services/PluginHostService.js";

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
  // --- Plugin bridge (Phase 11) -----------------------------------------
  // These channels back `window.meithPlugin` in plugin tabs. Every handler
  // resolves the calling plugin AUTHORITATIVELY from `event.sender.id` via
  // PluginHostService — renderer-supplied identity is never trusted.
  /** Plugin -> main (sendSync): resolve this webContents' approved identity (or null). */
  pluginIdentity: "meith:plugin:identity",
  /** Plugin -> main (invoke): list registry tools. */
  pluginToolsList: "meith:plugin:tools:list",
  /** Plugin -> main (invoke): call a registry tool (capability-gated). */
  pluginToolsCall: "meith:plugin:tools:call",
  /** Plugin -> main (invoke): read browser tabs (plugin tabs excluded). */
  pluginStorageBrowserTabs: "meith:plugin:storage:browserTabs",
  /** Plugin -> main (invoke): read workspace tabs. */
  pluginStorageWorkspaceTabs: "meith:plugin:storage:workspaceTabs",
  /** Plugin -> main (invoke): raw CDP command (requires `cdp` API). */
  pluginCdp: "meith:plugin:cdp",
  /** Plugin -> main (send): start an `ai.streamText` call `{ callId, prompt }`. */
  pluginAiStart: "meith:plugin:ai:start",
  /** Plugin -> main (send): cancel an in-flight `ai.streamText` call `{ callId }`. */
  pluginAiCancel: "meith:plugin:ai:cancel",
  /** Main -> plugin: a streamed AI chunk for a call (text/done/error). */
  pluginAiChunk: "meith:plugin:ai:chunk",
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

  // --- Plugin bridge -----------------------------------------------------
  // The security boundary: identity is resolved from the SENDER webContents id
  // (`event.sender.id`) via PluginHostService, never from anything the plugin
  // page sends. Unknown senders / unapproved APIs / disallowed tool
  // capabilities are rejected before any service is touched.
  registerPluginHandlers(container, getWindow);

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

/**
 * Register the `window.meithPlugin` bridge handlers. Split out so the security
 * boundary lives in one place. EVERY handler derives the calling plugin from
 * `event.sender.id` via `container.plugins`; nothing the page sends is trusted
 * for identity or grants.
 */
function registerPluginHandlers(
  container: ServiceContainer,
  getWindow: () => BrowserWindow | null,
): void {
  const { plugins, registry } = container;

  // Synchronous identity resolution at preload init. Returns ONLY approved
  // grants, or null for any webContents that is not an enabled plugin (normal
  // tabs, disabled/uninstalled plugins). The preload exposes nothing on null.
  ipcMain.on(IPC.pluginIdentity, (event) => {
    const resolved = plugins.resolveByWebContents(event.sender.id);
    if (!resolved) {
      event.returnValue = null;
      return;
    }
    const plugin = plugins.get(resolved.pluginId);
    const identity: MeithPluginIdentity = {
      pluginId: resolved.pluginId,
      name: plugin?.name ?? resolved.pluginId,
      version: plugin?.version ?? "0.0.0",
      apis: resolved.approvedApis,
      capabilities: resolved.approvedCapabilities,
    };
    event.returnValue = identity;
  });

  ipcMain.handle(IPC.pluginToolsList, (event) => {
    // Listing requires the `tools` API but no capability; it never runs a tool.
    try {
      plugins.assertApiAllowed(event.sender.id, "tools");
    } catch {
      return [];
    }
    return registry.describe();
  });

  ipcMain.handle(
    IPC.pluginToolsCall,
    async (event, name: string, args: Record<string, unknown>) => {
      let identity: MeithPluginIdentity | null = null;
      try {
        // Identity + per-tool capability gate, both resolved from the sender.
        const resolved = plugins.assertToolAllowed(event.sender.id, name);
        identity = {
          pluginId: resolved.pluginId,
          name: resolved.pluginId,
          version: "",
          apis: resolved.approvedApis,
          capabilities: resolved.approvedCapabilities,
        };
      } catch (err) {
        return pluginErrorResult(err);
      }
      const tabId = plugins.tabIdForWebContents(event.sender.id);
      return registry.call(
        {
          cwd: process.cwd(),
          caller: "plugin",
          // Identity comes from the sender mapping, never from the payload.
          sessionId: `plugin:${identity.pluginId}`,
          tabId,
        },
        name,
        args ?? {},
      );
    },
  );

  ipcMain.handle(IPC.pluginStorageBrowserTabs, (event) => {
    try {
      plugins.assertApiAllowed(event.sender.id, "storage");
    } catch {
      return [];
    }
    // Plugin-mode tabs are hidden from plugins by default.
    return container.browserTabs.listBrowserTabs();
  });

  ipcMain.handle(IPC.pluginStorageWorkspaceTabs, (event) => {
    try {
      plugins.assertApiAllowed(event.sender.id, "storage");
    } catch {
      return [];
    }
    return container.browserTabs.listWorkspaceTabs();
  });

  ipcMain.handle(
    IPC.pluginCdp,
    (event, tabId: string, method: string, params: Record<string, unknown>) => {
      try {
        // CDP is browser control; require both the `cdp` API and the matching
        // capability on the underlying tool.
        plugins.assertApiAllowed(event.sender.id, "cdp");
        plugins.assertToolAllowed(event.sender.id, "cdp_command");
      } catch (err) {
        return pluginErrorResult(err);
      }
      return registry.call(
        { cwd: process.cwd(), caller: "plugin", tabId },
        "cdp_command",
        { tabId, method, params },
      );
    },
  );

  // --- ai.streamText ------------------------------------------------------
  // Each call spins up an ephemeral, plugin-attributed agent session and drives
  // `agents.run` (which enforces the agent permission model — plugins cannot
  // bypass it). Text AND error chunks are forwarded; the session is always
  // cleaned up. Cancellation aborts the run via the agent's cancel().
  const aiSessions = new Map<string, string>(); // callId -> sessionId

  ipcMain.on(
    IPC.pluginAiStart,
    async (event, payload: { callId: string; prompt: string }) => {
      const callId = payload?.callId;
      const sender = event.sender;
      const send = (chunk: Record<string, unknown>) => {
        if (!sender.isDestroyed()) sender.send(IPC.pluginAiChunk, { callId, ...chunk });
      };
      let identity: ReturnType<typeof plugins.resolveByWebContents>;
      try {
        identity = plugins.assertApiAllowed(sender.id, "ai");
      } catch (err) {
        send({ type: "error", message: pluginErrorMessage(err) });
        return;
      }
      try {
        const session = container.agents.createSession({
          cwd: process.cwd(),
          title: `plugin:${identity.pluginId}`,
        });
        aiSessions.set(callId, session.id);
        for await (const chunk of container.agents.run(session.id, payload.prompt)) {
          if (chunk.type === "text") send({ type: "text", delta: chunk.text });
          else if (chunk.type === "error")
            send({ type: "error", message: chunk.message });
        }
        send({ type: "done" });
      } catch (err) {
        send({ type: "error", message: pluginErrorMessage(err) });
      } finally {
        const sessionId = aiSessions.get(callId);
        if (sessionId) {
          container.agents.deleteSession(sessionId);
          aiSessions.delete(callId);
        }
      }
    },
  );

  ipcMain.on(IPC.pluginAiCancel, (_event, payload: { callId: string }) => {
    const sessionId = aiSessions.get(payload?.callId);
    if (sessionId) container.agents.cancel(sessionId);
  });
}

/** Convert a thrown plugin/permission error into a structured ToolResult. */
function pluginErrorResult(err: unknown): ReturnType<typeof errorResult> {
  if (err instanceof PluginError) {
    const code = err.code === "PERMISSION_DENIED" ? "PERMISSION_DENIED" : "TOOL_FAILED";
    return errorResult(code, err.message);
  }
  return errorResult("TOOL_FAILED", err instanceof Error ? err.message : String(err));
}

/** Extract a human-readable message from a thrown plugin/permission error. */
function pluginErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
