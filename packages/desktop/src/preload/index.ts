import type { ToolDescriptor } from "@meith/protocol";
import type { AppState, BrowserViewport, LogEntry } from "@meith/shared";
import { contextBridge, ipcRenderer } from "electron";
import type { MeithBridge } from "../bridge.js";

// Channel names duplicated as literals to avoid importing main-process code
// into the sandboxed preload bundle. Keep in sync with main/ipc/handlers.ts.
const IPC = {
  toolsList: "meith:tools:list",
  toolCall: "meith:tools:call",
  getState: "meith:state:get",
  stateChanged: "meith:state:changed",
  getLogs: "meith:logs:get",
  logEntry: "meith:logs:entry",
  browserViewport: "meith:browser:viewport",
  terminalData: "meith:terminal:data",
  terminalExit: "meith:terminal:exit",
  dialogOpenFolder: "meith:dialog:openFolder",
  agentListSessions: "meith:agent:sessions:list",
  agentGetSession: "meith:agent:session:get",
  agentCreateSession: "meith:agent:session:create",
  agentDeleteSession: "meith:agent:session:delete",
  agentSendMessage: "meith:agent:message:send",
  agentCancel: "meith:agent:cancel",
  agentPermissionDecision: "meith:agent:permission:decision",
  agentGetConfig: "meith:agent:config:get",
  agentSetConfig: "meith:agent:config:set",
  agentChunk: "meith:agent:chunk",
  agentSession: "meith:agent:session",
  agentPermission: "meith:agent:permission",
} as const;

const api: MeithBridge = {
  tools: {
    list: () => ipcRenderer.invoke(IPC.toolsList) as Promise<ToolDescriptor[]>,
    call: (name, args = {}) => ipcRenderer.invoke(IPC.toolCall, name, args),
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
  agent: {
    listSessions: () => ipcRenderer.invoke(IPC.agentListSessions),
    getSession: (id) => ipcRenderer.invoke(IPC.agentGetSession, id),
    createSession: (input) => ipcRenderer.invoke(IPC.agentCreateSession, input),
    deleteSession: (id) => ipcRenderer.invoke(IPC.agentDeleteSession, id),
    sendMessage: (sessionId, text) =>
      ipcRenderer.invoke(IPC.agentSendMessage, sessionId, text),
    cancel: (sessionId) => ipcRenderer.invoke(IPC.agentCancel, sessionId),
    decide: (decision) => ipcRenderer.invoke(IPC.agentPermissionDecision, decision),
    getConfig: () => ipcRenderer.invoke(IPC.agentGetConfig),
    setConfig: (patch) => ipcRenderer.invoke(IPC.agentSetConfig, patch),
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
