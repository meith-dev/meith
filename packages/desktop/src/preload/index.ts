import { contextBridge, ipcRenderer } from "electron";
import type { AppState, LogEntry } from "@aide/shared";
import type { ToolDescriptor } from "@aide/protocol";
import type { AideBridge } from "../bridge.js";

// Channel names duplicated as literals to avoid importing main-process code
// into the sandboxed preload bundle. Keep in sync with main/ipc/handlers.ts.
const IPC = {
  toolsList: "aide:tools:list",
  toolCall: "aide:tools:call",
  getState: "aide:state:get",
  stateChanged: "aide:state:changed",
  getLogs: "aide:logs:get",
  logEntry: "aide:logs:entry",
} as const;

const api: AideBridge = {
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
};

contextBridge.exposeInMainWorld("aide", api);
