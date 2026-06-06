import { contextBridge, ipcRenderer } from "electron";
const IPC = {
  toolsList: "aide:tools:list",
  toolCall: "aide:tools:call",
  getState: "aide:state:get",
  stateChanged: "aide:state:changed",
  getLogs: "aide:logs:get",
  logEntry: "aide:logs:entry"
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
contextBridge.exposeInMainWorld("aide", api);
