import { contextBridge, ipcRenderer } from "electron";
const IPC = {
  toolsList: "meith:tools:list",
  toolCall: "meith:tools:call",
  getState: "meith:state:get",
  stateChanged: "meith:state:changed",
  getLogs: "meith:logs:get",
  logEntry: "meith:logs:entry"
};
const api = {
  tools: {
    list: () => ipcRenderer.invoke(IPC.toolsList),
    call: (name, args = {}) => ipcRenderer.invoke(IPC.toolCall, name, args)
  },
  state: {
    get: () => ipcRenderer.invoke(IPC.getState),
    onChange: (cb) => {
      const listener = (_e, state) => cb(state);
      ipcRenderer.on(IPC.stateChanged, listener);
      return () => ipcRenderer.removeListener(IPC.stateChanged, listener);
    }
  },
  logs: {
    get: (limit) => ipcRenderer.invoke(IPC.getLogs, limit),
    onEntry: (cb) => {
      const listener = (_e, entry) => cb(entry);
      ipcRenderer.on(IPC.logEntry, listener);
      return () => ipcRenderer.removeListener(IPC.logEntry, listener);
    }
  }
};
contextBridge.exposeInMainWorld("meith", api);
