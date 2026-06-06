import { dirname, basename, join } from "node:path";
import { ipcMain, app, BrowserWindow } from "electron";
import { mkdirSync, writeFileSync, openSync, writeSync, fsyncSync, closeSync, renameSync, existsSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { newSessionId, newMessageId, AppStateSchema, defaultAppState, newSpaceId, newBrowserTabId, newWorkspaceTabId, LogEntrySchema, createId, okResult, errorResult, DEFAULT_TOOL_TIMEOUT_MS, isToolResult, ToolError } from "@meith/shared";
import { EventEmitter } from "node:events";
import net from "node:net";
import { NdjsonParser, ClientMessageSchema, PROTOCOL_VERSION, encodeMessage, defineTool } from "@meith/protocol";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
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
function atomicWriteFileSync(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}
function appendLineSync(path, line) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${line}
`, { flag: "a" });
}
function readJsonSafe(path, parse) {
  if (!existsSync(path)) return { value: null, corrupt: false };
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { value: null, corrupt: false };
  }
  try {
    return { value: parse(JSON.parse(text)), corrupt: false };
  } catch {
    const backupPath = `${path}.corrupt-${Date.now()}`;
    try {
      renameSync(path, backupPath);
    } catch {
      return { value: null, corrupt: true };
    }
    return { value: null, corrupt: true, backupPath };
  }
}
class JsonStore {
  constructor(opts) {
    this.opts = opts;
    this.debounceMs = opts.debounceMs ?? 150;
    const { value, corrupt, backupPath } = readJsonSafe(opts.path, opts.parse);
    if (value !== null) {
      this.value = value;
    } else {
      this.value = opts.defaults();
      if (corrupt) opts.onCorruption?.(backupPath);
    }
  }
  value;
  timer = null;
  dirty = false;
  debounceMs;
  get() {
    return this.value;
  }
  /** Replace the value and schedule a persist. */
  set(value) {
    this.value = value;
    this.schedule();
  }
  schedule() {
    this.dirty = true;
    if (this.debounceMs <= 0) {
      this.flush();
      return;
    }
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
    this.timer.unref?.();
  }
  /** Force any pending write to disk immediately (e.g. on shutdown). */
  flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    atomicWriteFileSync(this.opts.path, JSON.stringify(this.value, null, 2));
    this.dirty = false;
  }
}
const CURRENT_STATE_VERSION = 1;
const migrations = {
  // 0 -> 1: the original unversioned shape. Ensure the versioned fields exist
  // (early builds had no `workspaceTabs`/`activeSpaceId`).
  0: (raw) => ({
    ...raw,
    version: 1,
    spaces: Array.isArray(raw.spaces) ? raw.spaces : [],
    activeSpaceId: raw.activeSpaceId ?? null,
    browserTabs: Array.isArray(raw.browserTabs) ? raw.browserTabs : [],
    workspaceTabs: Array.isArray(raw.workspaceTabs) ? raw.workspaceTabs : []
  })
};
function rawVersion(raw) {
  if (raw && typeof raw === "object" && typeof raw.version === "number") {
    return raw.version;
  }
  return 0;
}
function migrateAppState(raw) {
  let current = raw && typeof raw === "object" ? { ...raw } : {};
  let version = rawVersion(current);
  while (version < CURRENT_STATE_VERSION) {
    const migrate = migrations[version];
    if (!migrate) {
      throw new Error(`No migration from state version ${version}`);
    }
    current = migrate(current);
    version = rawVersion(current);
  }
  if (version > CURRENT_STATE_VERSION) {
    throw new Error(
      `State version ${version} is newer than supported ${CURRENT_STATE_VERSION}`
    );
  }
  return AppStateSchema.parse(current);
}
class AppStateService extends EventEmitter {
  constructor(statePath, logger, debounceMs = 150) {
    super();
    this.logger = logger;
    this.store = new JsonStore({
      path: statePath,
      parse: migrateAppState,
      defaults: defaultAppState,
      debounceMs,
      onCorruption: (backupPath) => {
        this.logger.warn(
          "AppState",
          `state file was corrupt; reset to defaults${backupPath ? ` (backed up to ${backupPath})` : ""}`
        );
      }
    });
    this.ensureDefaultSpace();
  }
  store;
  ensureDefaultSpace() {
    const state = this.store.get();
    if (state.spaces.length === 0) {
      const id = newSpaceId();
      this.update((draft) => {
        draft.spaces.push({
          id,
          name: "Default",
          color: "#6366f1",
          createdAt: Date.now()
        });
        draft.activeSpaceId = id;
      }, "init default space");
    } else if (!state.activeSpaceId) {
      this.update((draft) => {
        draft.activeSpaceId = draft.spaces[0].id;
      }, "set active space");
    }
  }
  /** Read a deep copy so callers can't mutate internal state directly. */
  getState() {
    return structuredClone(this.store.get());
  }
  /**
   * Apply a mutation function, persist, validate, and broadcast the change.
   * All writes funnel through here to keep persistence + events consistent.
   */
  update(mutate, reason = "update") {
    const draft = structuredClone(this.store.get());
    mutate(draft);
    const next = AppStateSchema.parse(draft);
    this.store.set(next);
    this.logger.debug("AppState", `state changed (${reason})`);
    const snapshot = structuredClone(next);
    this.emit("change", snapshot);
    return snapshot;
  }
  /** Force any pending debounced write to disk (call on shutdown). */
  flush() {
    this.store.flush();
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
class JsonlStore {
  constructor(opts) {
    this.opts = opts;
    this.maxRecords = opts.maxRecords ?? 5e3;
    this.compactFactor = opts.compactFactor ?? 1.5;
    this.count = this.readAll().length;
  }
  count = 0;
  maxRecords;
  compactFactor;
  /** Append one record and compact if the file has grown past the threshold. */
  append(record) {
    appendLineSync(this.opts.path, JSON.stringify(record));
    this.count += 1;
    if (this.maxRecords > 0 && this.count > Math.ceil(this.maxRecords * this.compactFactor)) {
      this.compact();
    }
  }
  /** Read all valid records, skipping any malformed lines. */
  readAll() {
    if (!existsSync(this.opts.path)) return [];
    const text = readFileSync(this.opts.path, "utf8");
    const out = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = this.opts.parse(JSON.parse(trimmed));
        if (parsed !== null) out.push(parsed);
      } catch {
      }
    }
    return out;
  }
  /** Read the most recent `limit` records (all if omitted). */
  tail(limit) {
    const all = this.readAll();
    if (!limit || limit >= all.length) return all;
    return all.slice(-limit);
  }
  /** Rewrite the file atomically, keeping only the most recent `maxRecords`. */
  compact() {
    const kept = this.tail(this.maxRecords || void 0);
    const body = kept.map((r) => JSON.stringify(r)).join("\n");
    atomicWriteFileSync(this.opts.path, body.length ? `${body}
` : "");
    this.count = kept.length;
  }
}
class Logger extends EventEmitter {
  entries = [];
  max;
  store;
  constructor(options = {}) {
    super();
    this.max = options.max ?? 1e3;
    if (options.logPath) {
      this.store = new JsonlStore({
        path: options.logPath,
        parse: (raw) => {
          const parsed = LogEntrySchema.safeParse(raw);
          return parsed.success ? parsed.data : null;
        },
        maxRecords: options.maxRecords ?? 5e3
      });
      this.entries = this.store.tail(this.max);
    }
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
    this.store?.append(entry);
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
class StorageService {
  constructor(opts) {
    this.opts = opts;
    const logStore = new JsonlStore({
      path: opts.logPath,
      parse: (raw) => raw
    });
    this.define({
      name: "state",
      kind: "json",
      path: `${opts.dataDir}/state.json`,
      description: "Small, bounded application state (spaces, tabs).",
      read: () => opts.appState.getState()
    });
    this.define({
      name: "logs",
      kind: "jsonl",
      path: opts.logPath,
      description: "Append-only structured log history.",
      read: (limit) => logStore.tail(limit ?? 200)
    });
  }
  collections = /* @__PURE__ */ new Map();
  define(def) {
    this.collections.set(def.name, def);
  }
  /** The directory all collections live under. */
  get dataDirectory() {
    return this.opts.dataDir;
  }
  listCollections() {
    return [...this.collections.values()].map((def) => {
      let sizeBytes = 0;
      const exists = existsSync(def.path);
      if (exists) {
        try {
          sizeBytes = statSync(def.path).size;
        } catch {
          sizeBytes = 0;
        }
      }
      return {
        name: def.name,
        kind: def.kind,
        path: def.path,
        description: def.description,
        exists,
        sizeBytes
      };
    });
  }
  readCollection(name, limit) {
    const def = this.collections.get(name);
    if (!def) {
      throw new Error(`Unknown collection: ${name}`);
    }
    return def.read(limit);
  }
  /** Full snapshot suitable for backup/debugging. */
  exportState() {
    return {
      exportedAt: Date.now(),
      dataDirectory: this.opts.dataDir,
      stateVersion: CURRENT_STATE_VERSION,
      collections: this.listCollections(),
      state: this.opts.appState.getState()
    };
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
    const inflight = /* @__PURE__ */ new Map();
    const send = (msg) => {
      if (!socket.writableEnded) socket.write(encodeMessage(msg));
    };
    const parser = new NdjsonParser((err, line) => {
      this.logger.warn("Socket", `dropping malformed frame: ${err.message}`);
      send({
        type: "error",
        code: "PROTOCOL_ERROR",
        message: `Malformed JSON frame ignored: ${err.message}`
      });
    });
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      for (const frame of parser.push(chunk)) {
        void this.handleFrame(frame, send, inflight);
      }
    });
    socket.on("error", (err) => {
      this.logger.warn("Socket", `connection error: ${String(err)}`);
    });
    socket.on("close", () => {
      for (const controller of inflight.values()) controller.abort();
      inflight.clear();
    });
  }
  async handleFrame(frame, send, inflight) {
    const parsed = ClientMessageSchema.safeParse(frame);
    if (!parsed.success) {
      send({
        type: "error",
        code: "PROTOCOL_ERROR",
        message: `Invalid message: ${parsed.error.message}`
      });
      return;
    }
    const msg = parsed.data;
    if (msg.protocol != null && msg.protocol !== PROTOCOL_VERSION) {
      this.logger.warn(
        "Socket",
        `client protocol ${msg.protocol} != server ${PROTOCOL_VERSION}`
      );
    }
    if (msg.type === "list_tools") {
      send({ type: "tools_list", tools: this.registry.describe() });
      return;
    }
    if (msg.type === "cancel_tool_call") {
      inflight.get(msg.requestId)?.abort();
      return;
    }
    const info = msg.clientInfo;
    const ctx = {
      cwd: info.cwd ?? process.cwd(),
      caller: info.caller,
      sessionId: info.sessionId,
      spaceId: info.spaceId,
      tabId: info.tabId
    };
    const controller = new AbortController();
    inflight.set(msg.requestId, controller);
    const emit = (event) => send({ type: "tool_event", requestId: msg.requestId, event });
    try {
      const result = await this.registry.call(ctx, msg.toolName, msg.arguments, {
        timeoutMs: msg.timeoutMs,
        signal: controller.signal,
        emit
      });
      send({ type: "tool_result", requestId: msg.requestId, result });
    } finally {
      inflight.delete(msg.requestId);
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
function createAppTools(deps) {
  const appGetState = defineTool({
    name: "app_get_state",
    description: "Return the full persistent application state.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => deps.appState.getState()
  });
  const appGetLogs = defineTool({
    name: "app_get_logs",
    description: "Return recent structured app log entries.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      limit: z.number().int().positive().max(1e3).optional()
    }),
    execute: (_ctx, input) => deps.logger.list(input.limit)
  });
  const getProcessTree = defineTool({
    name: "get_process_tree",
    description: "[placeholder] Return the tree of managed child processes (dev servers, terminals).",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => okResult(
      {
        placeholder: true,
        devServers: deps.devServers.list().map((s) => ({
          id: s.id,
          command: s.command,
          cwd: s.cwd,
          status: s.status,
          pid: s.pid ?? null
        }))
      },
      {
        diagnostics: [
          {
            level: "warn",
            message: "get_process_tree is partial: reflects DevServerService/TerminalService PIDs only."
          }
        ]
      }
    )
  });
  const getProcessLogs = defineTool({
    name: "get_process_logs",
    description: "[placeholder] Return captured logs for a managed process (dev server / terminal).",
    capabilities: ["read-only"],
    inputSchema: z.object({
      processId: z.string().describe("Dev server or terminal id.")
    }),
    execute: (_ctx, input) => {
      const server = deps.devServers.get(input.processId);
      return okResult({
        placeholder: true,
        processId: input.processId,
        logs: server?.logs ?? []
      });
    }
  });
  return [appGetState, appGetLogs, getProcessTree, getProcessLogs];
}
function createBrowserTools(deps) {
  const getTabs = defineTool({
    name: "get_tabs",
    description: "List browser tabs and workspace tabs, optionally filtered by space.",
    capabilities: ["read-only"],
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
    capabilities: ["controls-browser"],
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
    capabilities: ["controls-browser", "read-only"],
    inputSchema: z.object({
      tabId: z.string().optional()
    }),
    // Resolves ok=true with a placeholder payload + a diagnostic so callers can
    // integrate against the final shape before capture is implemented.
    execute: (_ctx, input) => okResult(
      { placeholder: true, tabId: input.tabId ?? null },
      {
        diagnostics: [
          {
            level: "warn",
            message: "take_screenshot is not implemented yet. Will use webContents.capturePage()."
          }
        ]
      }
    )
  });
  return [getTabs, openBrowserTab, takeScreenshot];
}
class ToolRegistry {
  tools = /* @__PURE__ */ new Map();
  shuttingDown = false;
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
  /** Reject new calls during shutdown so in-flight work can drain cleanly. */
  beginShutdown() {
    this.shuttingDown = true;
  }
  /** Serializable list for `list_tools` / agent function definitions. */
  describe() {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      capabilities: tool.capabilities ?? [],
      inputSchema: zodToJsonSchema(tool.inputSchema, {
        $refStrategy: "none"
      })
    }));
  }
  /**
   * Validate input, apply timeout + cancellation, run the tool, and normalize
   * the outcome into a `ToolResult`. This never throws for tool-level problems —
   * failures come back as `{ ok: false, error }` so every transport can relay
   * them uniformly.
   */
  async call(ctx, name, args, opts = {}) {
    if (this.shuttingDown) {
      return errorResult("RUNTIME_SHUTTING_DOWN", "Runtime is shutting down");
    }
    const tool = this.tools.get(name);
    if (!tool) {
      return errorResult("UNKNOWN_TOOL", `Unknown tool: ${name}`);
    }
    const parsed = tool.inputSchema.safeParse(args ?? {});
    if (!parsed.success) {
      return errorResult(
        "VALIDATION_ERROR",
        `Invalid arguments for "${name}"`,
        parsed.error.flatten()
      );
    }
    const timeoutMs = opts.timeoutMs ?? tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
    const signal = mergeSignals(opts.signal, timeoutController.signal);
    const fullCtx = { ...ctx, signal, emit: opts.emit };
    try {
      const raw = await Promise.race([
        Promise.resolve(tool.execute(fullCtx, parsed.data)),
        abortPromise(signal)
      ]);
      return isToolResult(raw) ? raw : okResult(raw);
    } catch (err) {
      if (timeoutController.signal.aborted) {
        return errorResult("TIMEOUT", `Tool "${name}" timed out after ${timeoutMs}ms`);
      }
      if (opts.signal?.aborted) {
        return errorResult("CANCELLED", `Tool "${name}" was cancelled`);
      }
      if (err instanceof ToolError) {
        return errorResult(err.code, err.message, err.details);
      }
      return errorResult("TOOL_FAILED", err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }
  }
}
function abortPromise(signal) {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    signal.addEventListener("abort", () => reject(new Error("aborted")), {
      once: true
    });
  });
}
function mergeSignals(a, b) {
  if (!a) return b;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (a.aborted || b.aborted) controller.abort();
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}
function createStorageTools(deps) {
  const listCollections = defineTool({
    name: "storage_list_collections",
    description: "List durable storage collections with kind, path, and size.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => ({
      dataDirectory: deps.storage.dataDirectory,
      collections: deps.storage.listCollections()
    })
  });
  const readCollection = defineTool({
    name: "storage_read_collection",
    description: "Read a storage collection by name. For append-only collections, returns the most recent records.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      name: z.string().describe("Collection name, e.g. 'state' or 'logs'."),
      limit: z.number().int().positive().max(5e3).optional()
    }),
    execute: (_ctx, input) => {
      try {
        return deps.storage.readCollection(input.name, input.limit);
      } catch (err) {
        return errorResult(
          "VALIDATION_ERROR",
          err instanceof Error ? err.message : String(err),
          { name: input.name }
        );
      }
    }
  });
  const exportState = defineTool({
    name: "storage_export_state",
    description: "Export a full snapshot of persisted state plus storage metadata for backup/debugging.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => deps.storage.exportState()
  });
  return [listCollections, readCollection, exportState];
}
function meithPaths() {
  const home = process.env.MEITH_HOME ?? join(homedir(), ".meith");
  return { home, configPath: join(home, "config.json") };
}
async function bootstrap(userDataPath) {
  mkdirSync(userDataPath, { recursive: true });
  const logPath = join(userDataPath, "logs.jsonl");
  const logger = new Logger({ logPath });
  const { home, configPath } = meithPaths();
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
  const storage = new StorageService({ dataDir: userDataPath, appState, logPath });
  const registry = new ToolRegistry();
  const deps = { appState, browserTabs, devServers, logger, storage };
  registry.registerAll(createBrowserTools(deps));
  registry.registerAll(createAppTools(deps));
  registry.registerAll(createStorageTools(deps));
  const agents = new AgentService(registry, logger);
  const socket = new ToolSocketService(socketPath, registry, logger);
  await socket.start();
  logger.info("Bootstrap", "service container ready");
  const shutdown = async () => {
    registry.beginShutdown();
    await socket.stop();
    appState.flush();
    logger.info("Bootstrap", "shutdown complete");
  };
  return {
    logger,
    appState,
    browserTabs,
    devServers,
    terminals,
    projects,
    agents,
    storage,
    registry,
    socket,
    config,
    shutdown
  };
}
const IPC = {
  toolsList: "meith:tools:list",
  toolCall: "meith:tools:call",
  getState: "meith:state:get",
  stateChanged: "meith:state:changed",
  getLogs: "meith:logs:get",
  logEntry: "meith:logs:entry"
};
function registerIpcHandlers(container2, getWindow) {
  ipcMain.handle(IPC.toolsList, () => container2.registry.describe());
  ipcMain.handle(
    IPC.toolCall,
    async (_event, name, args) => {
      const ctx = {
        cwd: process.cwd(),
        caller: "renderer"
      };
      return container2.registry.call(ctx, name, args ?? {});
    }
  );
  ipcMain.handle(IPC.getState, () => container2.appState.getState());
  ipcMain.handle(IPC.getLogs, (_event, limit) => container2.logger.list(limit));
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
