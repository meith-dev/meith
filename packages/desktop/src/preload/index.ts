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
};

contextBridge.exposeInMainWorld("meith", api);
