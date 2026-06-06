import { dirname, basename, join } from "node:path";
import { ipcMain, app, BrowserWindow } from "electron";
import { homedir } from "node:os";
import { existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { EventEmitter } from "node:events";
import { createId, AppStateSchema, defaultAppState, newSpaceId, newBrowserTabId, newWorkspaceTabId, newSessionId, newMessageId } from "@aide/shared";
import net from "node:net";
import { NdjsonParser, ClientMessageSchema, encodeMessage, defineTool } from "@aide/protocol";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
class Logger extends EventEmitter {
  entries = [];
  max;
  constructor(max = 1e3) {
    super();
    this.max = max;
  }
  log(level, source, message) {
    const entry = {
      id: createId("log"),
      ts: Date.now(),
      level,
      source,
      message
    };
    this.entries.push(entry);
    if (this.entries.length > this.max) this.entries.shift();
    const line = `[${source}] ${message}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
    this.emit("entry", entry);
    return entry;
  }
  debug = (source, message) => this.log("debug", source, message);
  info = (source, message) => this.log("info", source, message);
  warn = (source, message) => this.log("warn", source, message);
  error = (source, message) => this.log("error", source, message);
  list(limit) {
    if (!limit) return [...this.entries];
    return this.entries.slice(-limit);
  }
}
class AppStateService extends EventEmitter {
  constructor(statePath, logger) {
    super();
    this.statePath = statePath;
    this.logger = logger;
    this.state = this.load();
    this.ensureDefaultSpace();
  }
  state;
  load() {
    try {
      if (existsSync(this.statePath)) {
        const raw = JSON.parse(readFileSync(this.statePath, "utf8"));
        return AppStateSchema.parse(raw);
      }
    } catch (err) {
      this.logger.warn("AppState", `Failed to load state, resetting: ${String(err)}`);
    }
    return defaultAppState();
  }
  persist() {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), "utf8");
  }
  ensureDefaultSpace() {
    if (this.state.spaces.length === 0) {
      const id = newSpaceId();
      this.state.spaces.push({
        id,
        name: "Default",
        color: "#6366f1",
        createdAt: Date.now()
      });
      this.state.activeSpaceId = id;
      this.commit("init default space");
    } else if (!this.state.activeSpaceId) {
      this.state.activeSpaceId = this.state.spaces[0].id;
      this.commit("set active space");
    }
  }
  /** Read a deep copy so callers can't mutate internal state directly. */
  getState() {
    return structuredClone(this.state);
  }
  /**
   * Apply a mutation function, persist, validate, and broadcast the change.
   * All writes funnel through here to keep persistence + events consistent.
   */
  update(mutate, reason = "update") {
    const draft = structuredClone(this.state);
    mutate(draft);
    this.state = AppStateSchema.parse(draft);
    this.commit(reason);
    return this.getState();
  }
  commit(reason) {
    this.persist();
    this.logger.debug("AppState", `state changed (${reason})`);
    this.emit("change", this.getState());
  }
}
class BrowserTabService {
  constructor(appState, logger) {
    this.appState = appState;
    this.logger = logger;
  }
  activeSpaceId() {
    const state = this.appState.getState();
    return state.activeSpaceId ?? state.spaces[0]?.id ?? "default";
  }
  listBrowserTabs(spaceId) {
    const tabs = this.appState.getState().browserTabs;
    return spaceId ? tabs.filter((t) => t.spaceId === spaceId) : tabs;
  }
  listWorkspaceTabs(spaceId) {
    const tabs = this.appState.getState().workspaceTabs;
    return spaceId ? tabs.filter((t) => t.spaceId === spaceId) : tabs;
  }
  openBrowserTab(input) {
    const spaceId = input.spaceId ?? this.activeSpaceId();
    const tab = {
      id: newBrowserTabId(),
      spaceId,
      url: input.url,
      title: input.title ?? input.url,
      cwd: input.cwd,
      active: true,
      createdAt: Date.now()
    };
    this.appState.update((draft) => {
      for (const t of draft.browserTabs) {
        if (t.spaceId === spaceId) t.active = false;
      }
      draft.browserTabs.push(tab);
    }, "open_browser_tab");
    this.logger.info("BrowserTabs", `opened browser tab ${tab.id} -> ${tab.url}`);
    return tab;
  }
  closeBrowserTab(id) {
    let removed = false;
    this.appState.update((draft) => {
      const before = draft.browserTabs.length;
      draft.browserTabs = draft.browserTabs.filter((t) => t.id !== id);
      removed = draft.browserTabs.length < before;
    }, "close_browser_tab");
    return removed;
  }
  openWorkspaceTab(input) {
    const spaceId = input.spaceId ?? this.activeSpaceId();
    const tab = {
      id: newWorkspaceTabId(),
      spaceId,
      title: input.title,
      cwd: input.cwd,
      kind: input.kind ?? "editor",
      active: true,
      createdAt: Date.now()
    };
    this.appState.update((draft) => {
      for (const t of draft.workspaceTabs) {
        if (t.spaceId === spaceId) t.active = false;
      }
      draft.workspaceTabs.push(tab);
    }, "open_workspace_tab");
    this.logger.info("WorkspaceTabs", `opened workspace tab ${tab.id} (${tab.cwd})`);
    return tab;
  }
}
class DevServerService extends EventEmitter {
  constructor(logger) {
    super();
    this.logger = logger;
  }
  servers = /* @__PURE__ */ new Map();
  /** Register (but do not yet spawn) a dev server definition. */
  start(input) {
    const server = {
      id: `dev_${Math.random().toString(16).slice(2, 10)}`,
      cwd: input.cwd,
      command: input.command,
      status: "stopped",
      port: input.port,
      logs: []
    };
    this.servers.set(server.id, server);
    this.logger.warn(
      "DevServer",
      `start() is a stub: would run \`${input.command}\` in ${input.cwd}`
    );
    this.emit("change", this.list());
    return server;
  }
  appendLog(id, line) {
    const server = this.servers.get(id);
    if (!server) return;
    server.logs.push(line);
    this.emit("log", { id, line });
  }
  stop(id) {
    const server = this.servers.get(id);
    if (!server) return;
    server.status = "stopped";
    this.emit("change", this.list());
  }
  get(id) {
    return this.servers.get(id);
  }
  list() {
    return [...this.servers.values()];
  }
}
class TerminalService extends EventEmitter {
  constructor(logger) {
    super();
    this.logger = logger;
  }
  sessions = /* @__PURE__ */ new Map();
  create(cwd, shell = process.env.SHELL ?? "/bin/bash") {
    const session = {
      id: `term_${Math.random().toString(16).slice(2, 10)}`,
      cwd,
      shell
    };
    this.sessions.set(session.id, session);
    this.logger.warn("Terminal", `create() is a stub (no pty spawned) for ${session.id}`);
    return session;
  }
  write(id, _data) {
    if (!this.sessions.has(id)) throw new Error(`Unknown terminal: ${id}`);
  }
  list() {
    return [...this.sessions.values()];
  }
}
class ProjectService {
  constructor(logger) {
    this.logger = logger;
  }
  projects = /* @__PURE__ */ new Map();
  open(cwd) {
    if (!existsSync(cwd)) {
      this.logger.warn("Project", `open(): path does not exist: ${cwd}`);
    }
    const project = {
      id: `proj_${Math.random().toString(16).slice(2, 10)}`,
      name: basename(cwd) || cwd,
      cwd
    };
    this.projects.set(project.id, project);
    this.logger.info("Project", `opened project ${project.name} (${cwd})`);
    return project;
  }
  list() {
    return [...this.projects.values()];
  }
}
class AgentService {
  constructor(registry, logger) {
    this.registry = registry;
    this.logger = logger;
  }
  sessions = /* @__PURE__ */ new Map();
  adapter = null;
  registerAdapter(adapter) {
    this.adapter = adapter;
    this.logger.info("Agent", `registered adapter: ${adapter.displayName}`);
  }
  createSession(cwd) {
    const session = {
      id: newSessionId(),
      cwd,
      messages: [],
      createdAt: Date.now(),
      status: "idle"
    };
    this.sessions.set(session.id, session);
    return session;
  }
  getSession(id) {
    return this.sessions.get(id);
  }
  appendMessage(sessionId, role, content) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    const message = {
      id: newMessageId(),
      role,
      content,
      createdAt: Date.now()
    };
    session.messages.push(message);
    return message;
  }
  /** Builds the host context an adapter uses to call app tools. */
  hostContext() {
    return {
      listTools: () => this.registry.describe(),
      callTool: (name, args) => this.registry.call({ cwd: process.cwd(), caller: "agent" }, name, args),
      log: (message) => this.logger.info("Agent", message)
    };
  }
  /**
   * Run a session through the registered adapter.
   * Throws until an adapter is registered — by design, so callers fail loudly.
   */
  async *run(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    if (!this.adapter) {
      throw new Error(
        "No AgentAdapter registered. Implement AgentAdapter (ACP/MCP/SDK) and call registerAdapter()."
      );
    }
    session.status = "running";
    try {
      yield* this.adapter.run(session, this.hostContext());
      session.status = "idle";
    } catch (err) {
      session.status = "error";
      throw err;
    }
  }
}
class ToolSocketService {
  constructor(socketPath, registry, logger) {
    this.socketPath = socketPath;
    this.registry = registry;
    this.logger = logger;
  }
  server = null;
  start() {
    return new Promise((resolve, reject) => {
      if (existsSync(this.socketPath)) {
        try {
          unlinkSync(this.socketPath);
        } catch {
        }
      }
      this.server = net.createServer((socket) => this.handleConnection(socket));
      this.server.on("error", (err) => {
        this.logger.error("Socket", `server error: ${String(err)}`);
        reject(err);
      });
      this.server.listen(this.socketPath, () => {
        this.logger.info("Socket", `listening at ${this.socketPath}`);
        resolve();
      });
    });
  }
  handleConnection(socket) {
    const parser = new NdjsonParser();
    socket.setEncoding("utf8");
    const send = (msg) => socket.write(encodeMessage(msg));
    socket.on("data", async (chunk) => {
      let parsedFrames;
      try {
        parsedFrames = parser.push(chunk);
      } catch (err) {
        send({ type: "error", message: `Malformed JSON: ${String(err)}` });
        return;
      }
      for (const frame of parsedFrames) {
        await this.handleFrame(frame, send);
      }
    });
    socket.on("error", (err) => {
      this.logger.warn("Socket", `connection error: ${String(err)}`);
    });
  }
  async handleFrame(frame, send) {
    const parsed = ClientMessageSchema.safeParse(frame);
    if (!parsed.success) {
      send({
        type: "error",
        message: `Invalid message: ${parsed.error.message}`
      });
      return;
    }
    const msg = parsed.data;
    if (msg.type === "list_tools") {
      send({ type: "tools_list", tools: this.registry.describe() });
      return;
    }
    const ctx = {
      cwd: msg.context.cwd ?? process.cwd(),
      caller: "cli"
    };
    try {
      const result = await this.registry.call(ctx, msg.toolName, msg.arguments);
      send({ type: "tool_result", requestId: msg.requestId, result });
    } catch (err) {
      send({
        type: "error",
        requestId: msg.requestId,
        message: err instanceof Error ? err.message : String(err)
      });
    }
  }
  async stop() {
    if (!this.server) return;
    await new Promise((resolve) => this.server.close(() => resolve()));
    this.server = null;
    if (existsSync(this.socketPath)) {
      try {
        unlinkSync(this.socketPath);
      } catch {
      }
    }
  }
}
class ToolRegistry {
  tools = /* @__PURE__ */ new Map();
  register(tool) {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }
  registerAll(tools) {
    for (const t of tools) this.register(t);
  }
  has(name) {
    return this.tools.has(name);
  }
  /** Serializable list for `list_tools` / agent function definitions. */
  describe() {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema, {
        $refStrategy: "none"
      })
    }));
  }
  /** Validate input against the tool's schema, then execute it. */
  async call(ctx, name, args) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    const parsed = tool.inputSchema.parse(args ?? {});
    return await tool.execute(ctx, parsed);
  }
}
function createBrowserTools(deps) {
  const getTabs = defineTool({
    name: "get_tabs",
    description: "List browser tabs and workspace tabs, optionally filtered by space.",
    inputSchema: z.object({
      spaceId: z.string().optional().describe("Filter to a single space id.")
    }),
    execute: (_ctx, input) => ({
      browserTabs: deps.browserTabs.listBrowserTabs(input.spaceId),
      workspaceTabs: deps.browserTabs.listWorkspaceTabs(input.spaceId)
    })
  });
  const openBrowserTab = defineTool({
    name: "open_browser_tab",
    description: "Open a new browser tab pointing at a URL. Becomes a WebContentsView later.",
    inputSchema: z.object({
      url: z.string().describe("URL to open, e.g. http://localhost:3000"),
      title: z.string().optional(),
      spaceId: z.string().optional(),
      cwd: z.string().optional().describe("Optional associated project cwd.")
    }),
    execute: (_ctx, input) => deps.browserTabs.openBrowserTab(input)
  });
  const takeScreenshot = defineTool({
    name: "take_screenshot",
    description: "[placeholder] Capture a screenshot of a browser tab. Returns a stub until WebContentsView capture is implemented.",
    inputSchema: z.object({
      tabId: z.string().optional()
    }),
    execute: (_ctx, input) => ({
      ok: false,
      placeholder: true,
      message: "take_screenshot is not implemented yet. Will use webContents.capturePage().",
      tabId: input.tabId ?? null
    })
  });
  return [getTabs, openBrowserTab, takeScreenshot];
}
function createAppTools(deps) {
  const appGetState = defineTool({
    name: "app_get_state",
    description: "Return the full persistent application state.",
    inputSchema: z.object({}),
    execute: () => deps.appState.getState()
  });
  const appGetLogs = defineTool({
    name: "app_get_logs",
    description: "Return recent structured app log entries.",
    inputSchema: z.object({
      limit: z.number().int().positive().max(1e3).optional()
    }),
    execute: (_ctx, input) => deps.logger.list(input.limit)
  });
  const getProcessTree = defineTool({
    name: "get_process_tree",
    description: "[placeholder] Return the tree of managed child processes (dev servers, terminals).",
    inputSchema: z.object({}),
    execute: () => ({
      placeholder: true,
      message: "get_process_tree is not implemented yet. Will reflect DevServerService/TerminalService PIDs.",
      devServers: deps.devServers.list().map((s) => ({
        id: s.id,
        command: s.command,
        cwd: s.cwd,
        status: s.status,
        pid: s.pid ?? null
      }))
    })
  });
  const getProcessLogs = defineTool({
    name: "get_process_logs",
    description: "[placeholder] Return captured logs for a managed process (dev server / terminal).",
    inputSchema: z.object({
      processId: z.string().describe("Dev server or terminal id.")
    }),
    execute: (_ctx, input) => {
      const server = deps.devServers.get(input.processId);
      return {
        placeholder: true,
        processId: input.processId,
        logs: server?.logs ?? []
      };
    }
  });
  return [appGetState, appGetLogs, getProcessTree, getProcessLogs];
}
function aidePaths() {
  const home = process.env.AIDE_HOME ?? join(homedir(), ".aide");
  return { home, configPath: join(home, "config.json") };
}
async function bootstrap(userDataPath) {
  const logger = new Logger();
  mkdirSync(userDataPath, { recursive: true });
  const { home, configPath } = aidePaths();
  const socketPath = join(userDataPath, "tool.sock");
  const config = { userDataPath, socketPath, version: 1 };
  mkdirSync(home, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  logger.info("Bootstrap", `wrote config to ${configPath}`);
  const appState = new AppStateService(join(userDataPath, "state.json"), logger);
  const browserTabs = new BrowserTabService(appState, logger);
  const devServers = new DevServerService(logger);
  const terminals = new TerminalService(logger);
  const projects = new ProjectService(logger);
  const registry = new ToolRegistry();
  const deps = { appState, browserTabs, devServers, logger };
  registry.registerAll(createBrowserTools(deps));
  registry.registerAll(createAppTools(deps));
  const agents = new AgentService(registry, logger);
  const socket = new ToolSocketService(socketPath, registry, logger);
  await socket.start();
  logger.info("Bootstrap", "service container ready");
  return {
    logger,
    appState,
    browserTabs,
    devServers,
    terminals,
    projects,
    agents,
    registry,
    socket,
    config
  };
}
const IPC = {
  toolsList: "aide:tools:list",
  toolCall: "aide:tools:call",
  getState: "aide:state:get",
  stateChanged: "aide:state:changed",
  getLogs: "aide:logs:get",
  logEntry: "aide:logs:entry"
};
function registerIpcHandlers(container2, getWindow) {
  ipcMain.handle(IPC.toolsList, () => container2.registry.describe());
  ipcMain.handle(
    IPC.toolCall,
    async (_event, name, args) => {
      const ctx = { cwd: process.cwd(), caller: "renderer" };
      return container2.registry.call(ctx, name, args ?? {});
    }
  );
  ipcMain.handle(IPC.getState, () => container2.appState.getState());
  ipcMain.handle(
    IPC.getLogs,
    (_event, limit) => container2.logger.list(limit)
  );
  container2.appState.on("change", (state) => {
    getWindow()?.webContents.send(IPC.stateChanged, state);
  });
  container2.logger.on("entry", (entry) => {
    getWindow()?.webContents.send(IPC.logEntry, entry);
  });
}
let mainWindow = null;
let container = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.on("ready-to-show", () => mainWindow?.show());
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
app.whenReady().then(async () => {
  container = await bootstrap(app.getPath("userData"));
  registerIpcHandlers(container, () => mainWindow);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", async () => {
  await container?.socket.stop();
});
