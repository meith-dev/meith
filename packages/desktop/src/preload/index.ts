import type { ToolDescriptor } from "@meith/protocol";
import type { AppState, BrowserViewport, LogEntry } from "@meith/shared";
import { contextBridge, ipcRenderer } from "electron";
import type {
  MeithBridge,
  OverlayMenuDescriptor,
  OverlayMenuResult,
  OverlayTooltipDescriptor,
} from "../bridge.js";

// Channel names duplicated as literals to avoid importing main-process code
// into the sandboxed preload bundle. Keep in sync with main/ipc/handlers.ts.
const IPC = {
  toolsList: "meith:tools:list",
  toolCall: "meith:tools:call",
  aiComplete: "meith:ai:complete",
  getState: "meith:state:get",
  stateChanged: "meith:state:changed",
  getLogs: "meith:logs:get",
  logEntry: "meith:logs:entry",
  browserViewport: "meith:browser:viewport",
  browserCapture: "meith:browser:capture",
  // --- Overlay window (floating menus/tooltips above the native browser) ---
  overlayMenuShow: "meith:overlay:menu:show",
  overlayTooltipShow: "meith:overlay:tooltip:show",
  overlayTooltipHide: "meith:overlay:tooltip:hide",
  overlayMenuResolve: "meith:overlay:menu:resolve",
  overlayRenderMenu: "meith:overlay:render:menu",
  overlayRenderTooltip: "meith:overlay:render:tooltip",
  overlayHideTooltip: "meith:overlay:render:hideTooltip",
  overlayMenuResult: "meith:overlay:menu:result",
  terminalData: "meith:terminal:data",
  terminalExit: "meith:terminal:exit",
  devServersGet: "meith:devServers:get",
  devServersChanged: "meith:devServers:changed",
  devServerLog: "meith:devServer:log",
  dialogOpenFolder: "meith:dialog:openFolder",
  agentListSessions: "meith:agent:sessions:list",
  agentGetSession: "meith:agent:session:get",
  agentCreateSession: "meith:agent:session:create",
  agentDeleteSession: "meith:agent:session:delete",
  agentSendMessage: "meith:agent:message:send",
  agentStageAttachment: "meith:agent:attachment:stage",
  agentCancel: "meith:agent:cancel",
  agentPermissionDecision: "meith:agent:permission:decision",
  agentGetConfig: "meith:agent:config:get",
  agentSetConfig: "meith:agent:config:set",
  agentProbe: "meith:agent:probe",
  agentSetSessionModel: "meith:agent:session:model",
  agentMarkSessionViewed: "meith:agent:session:viewed",
  agentChunk: "meith:agent:chunk",
  agentSession: "meith:agent:session",
  agentPermission: "meith:agent:permission",
} as const;

const api: MeithBridge = {
  tools: {
    list: () => ipcRenderer.invoke(IPC.toolsList) as Promise<ToolDescriptor[]>,
    call: (name, args = {}) => ipcRenderer.invoke(IPC.toolCall, name, args),
  },
  ai: {
    complete: (input) => ipcRenderer.invoke(IPC.aiComplete, input),
  },
  state: {
    get: () => ipcRenderer.invoke(IPC.getState) as Promise<AppState>,
    onChange: (cb) => {
      const listener = (_e: unknown, state: AppState) => cb(state);
      ipcRenderer.on(IPC.stateChanged, listener);
      return () => ipcRenderer.removeListener(IPC.stateChanged, listener);
    },
  },
  logs: {
    get: (limit) => ipcRenderer.invoke(IPC.getLogs, limit) as Promise<LogEntry[]>,
    onEntry: (cb) => {
      const listener = (_e: unknown, entry: LogEntry) => cb(entry);
      ipcRenderer.on(IPC.logEntry, listener);
      return () => ipcRenderer.removeListener(IPC.logEntry, listener);
    },
  },
  browser: {
    setViewport: (bounds: BrowserViewport) =>
      ipcRenderer.send(IPC.browserViewport, bounds),
    capture: (tabId: string) =>
      ipcRenderer.invoke(IPC.browserCapture, tabId) as Promise<string | null>,
  },
  overlay: {
    // From the main window:
    showMenu: (descriptor: OverlayMenuDescriptor) =>
      ipcRenderer.send(IPC.overlayMenuShow, descriptor),
    showTooltip: (descriptor: OverlayTooltipDescriptor) =>
      ipcRenderer.send(IPC.overlayTooltipShow, descriptor),
    hideTooltip: () => ipcRenderer.send(IPC.overlayTooltipHide),
    onMenuResult: (cb) => {
      const listener = (_e: unknown, result: OverlayMenuResult) => cb(result);
      ipcRenderer.on(IPC.overlayMenuResult, listener);
      return () => ipcRenderer.removeListener(IPC.overlayMenuResult, listener);
    },
    // From the overlay window/document:
    onShowMenu: (cb) => {
      const listener = (_e: unknown, descriptor: OverlayMenuDescriptor) => cb(descriptor);
      ipcRenderer.on(IPC.overlayRenderMenu, listener);
      return () => ipcRenderer.removeListener(IPC.overlayRenderMenu, listener);
    },
    onShowTooltip: (cb) => {
      const listener = (_e: unknown, descriptor: OverlayTooltipDescriptor) =>
        cb(descriptor);
      ipcRenderer.on(IPC.overlayRenderTooltip, listener);
      return () => ipcRenderer.removeListener(IPC.overlayRenderTooltip, listener);
    },
    onHideTooltip: (cb) => {
      const listener = () => cb();
      ipcRenderer.on(IPC.overlayHideTooltip, listener);
      return () => ipcRenderer.removeListener(IPC.overlayHideTooltip, listener);
    },
    resolveMenu: (result: OverlayMenuResult) =>
      ipcRenderer.send(IPC.overlayMenuResolve, result),
  },
  dialog: {
    openFolder: () => ipcRenderer.invoke(IPC.dialogOpenFolder) as Promise<string | null>,
  },
  terminal: {
    onData: (cb) => {
      const listener = (_e: unknown, evt: { id: string; chunk: string }) => cb(evt);
      ipcRenderer.on(IPC.terminalData, listener);
      return () => ipcRenderer.removeListener(IPC.terminalData, listener);
    },
    onExit: (cb) => {
      const listener = (
        _e: unknown,
        evt: { id: string; exitCode: number; signal?: number },
      ) => cb(evt);
      ipcRenderer.on(IPC.terminalExit, listener);
      return () => ipcRenderer.removeListener(IPC.terminalExit, listener);
    },
  },
  devServers: {
    get: () => ipcRenderer.invoke(IPC.devServersGet),
    onChange: (cb) => {
      const listener = (_e: unknown, servers: unknown) => cb(servers as never);
      ipcRenderer.on(IPC.devServersChanged, listener);
      return () => ipcRenderer.removeListener(IPC.devServersChanged, listener);
    },
    onLog: (cb) => {
      const listener = (_e: unknown, evt: unknown) => cb(evt as never);
      ipcRenderer.on(IPC.devServerLog, listener);
      return () => ipcRenderer.removeListener(IPC.devServerLog, listener);
    },
  },
  agent: {
    listSessions: () => ipcRenderer.invoke(IPC.agentListSessions),
    getSession: (id) => ipcRenderer.invoke(IPC.agentGetSession, id),
    createSession: (input) => ipcRenderer.invoke(IPC.agentCreateSession, input),
    deleteSession: (id) => ipcRenderer.invoke(IPC.agentDeleteSession, id),
    sendMessage: (sessionId, input) =>
      ipcRenderer.invoke(IPC.agentSendMessage, sessionId, input),
    stageAttachment: (sessionId, input) =>
      ipcRenderer.invoke(IPC.agentStageAttachment, sessionId, input),
    cancel: (sessionId) => ipcRenderer.invoke(IPC.agentCancel, sessionId),
    decide: (decision) => ipcRenderer.invoke(IPC.agentPermissionDecision, decision),
    getConfig: () => ipcRenderer.invoke(IPC.agentGetConfig),
    setConfig: (patch) => ipcRenderer.invoke(IPC.agentSetConfig, patch),
    probe: (override) => ipcRenderer.invoke(IPC.agentProbe, override),
    setSessionModel: (sessionId, patch) =>
      ipcRenderer.invoke(IPC.agentSetSessionModel, sessionId, patch),
    markSessionViewed: (sessionId) =>
      ipcRenderer.invoke(IPC.agentMarkSessionViewed, sessionId),
    onChunk: (cb) => {
      const listener = (_e: unknown, evt: { sessionId: string; chunk: unknown }) =>
        cb(evt as never);
      ipcRenderer.on(IPC.agentChunk, listener);
      return () => ipcRenderer.removeListener(IPC.agentChunk, listener);
    },
    onSession: (cb) => {
      const listener = (_e: unknown, meta: unknown) => cb(meta as never);
      ipcRenderer.on(IPC.agentSession, listener);
      return () => ipcRenderer.removeListener(IPC.agentSession, listener);
    },
    onPermission: (cb) => {
      const listener = (_e: unknown, req: unknown) => cb(req as never);
      ipcRenderer.on(IPC.agentPermission, listener);
      return () => ipcRenderer.removeListener(IPC.agentPermission, listener);
    },
  },
};

contextBridge.exposeInMainWorld("meith", api);
