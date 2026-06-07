import { dirname, basename, join } from "node:path";
import { newSessionId, newMessageId, AppStateSchema, defaultAppState, newSpaceId, newBrowserTabId, newWorkspaceTabId, LogEntrySchema, createId, okResult, ToolError, errorResult, DEFAULT_TOOL_TIMEOUT_MS, isToolResult, BrowserViewportSchema } from "@meith/shared";
import { WebContentsView, ipcMain, app, BrowserWindow } from "electron";
import { mkdirSync, writeFileSync, openSync, writeSync, fsyncSync, closeSync, renameSync, existsSync, readFileSync, statSync, unlinkSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
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
const CURRENT_STATE_VERSION = 2;
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
  }),
  // 1 -> 2: real browser runtime adds live navigation/loading/ownership fields
  // to each browser tab. Backfill them on existing tab records.
  1: (raw) => ({
    ...raw,
    version: 2,
    browserTabs: (Array.isArray(raw.browserTabs) ? raw.browserTabs : []).map((tab) => {
      const t = tab ?? {};
      return {
        ...t,
        faviconUrl: t.faviconUrl ?? void 0,
        loadState: t.loadState ?? "idle",
        canGoBack: t.canGoBack ?? false,
        canGoForward: t.canGoForward ?? false,
        ownerId: t.ownerId ?? null
      };
    })
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
class ElementNotFoundError extends Error {
  constructor(tabId, elementId) {
    super(`Element ${elementId} not found in tab ${tabId}`);
    this.tabId = tabId;
    this.elementId = elementId;
    this.name = "ElementNotFoundError";
  }
}
const MAX_LOG$1 = 500;
let networkSeq = 0;
class HeadlessBrowserViewHost {
  views = /* @__PURE__ */ new Map();
  listeners = [];
  createView(tabId, url) {
    const view = {
      url,
      title: titleFromUrl(url),
      history: [url],
      cursor: 0,
      loadState: "complete",
      elements: [],
      clicks: 0,
      scrollX: 0,
      scrollY: 0,
      console: [],
      network: []
    };
    this.views.set(tabId, view);
    this.onNavigated(view, url);
    this.emit(tabId);
  }
  loadURL(tabId, url) {
    const view = this.views.get(tabId);
    if (!view) {
      this.createView(tabId, url);
      return;
    }
    view.history = view.history.slice(0, view.cursor + 1);
    view.history.push(url);
    view.cursor = view.history.length - 1;
    view.url = url;
    view.title = titleFromUrl(url);
    view.loadState = "complete";
    this.onNavigated(view, url);
    this.emit(tabId);
  }
  destroyView(tabId) {
    this.views.delete(tabId);
  }
  focusView(_tabId) {
  }
  reload(tabId) {
    const view = this.views.get(tabId);
    if (!view) return;
    view.loadState = "complete";
    this.onNavigated(view, view.url);
    this.emit(tabId);
  }
  goBack(tabId) {
    const view = this.views.get(tabId);
    if (!view || view.cursor <= 0) return;
    view.cursor -= 1;
    view.url = view.history[view.cursor];
    view.title = titleFromUrl(view.url);
    this.onNavigated(view, view.url);
    this.emit(tabId);
  }
  goForward(tabId) {
    const view = this.views.get(tabId);
    if (!view || view.cursor >= view.history.length - 1) return;
    view.cursor += 1;
    view.url = view.history[view.cursor];
    view.title = titleFromUrl(view.url);
    this.onNavigated(view, view.url);
    this.emit(tabId);
  }
  async capture(tabId) {
    if (!this.views.has(tabId)) return null;
    return { data: PLACEHOLDER_PNG, width: 1, height: 1 };
  }
  getNavState(tabId) {
    const view = this.views.get(tabId);
    if (!view) return null;
    return this.toNavState(view);
  }
  onNavStateChanged(cb) {
    this.listeners.push(cb);
  }
  // --- Automation & diagnostics ---
  async getBrowserState(tabId) {
    const view = this.views.get(tabId);
    if (!view) return null;
    return {
      url: view.url,
      title: view.title,
      viewport: { width: 1280, height: 800 },
      elements: view.elements.map((el, i) => ({
        id: `el-${i}`,
        tag: el.tag,
        role: el.role,
        label: el.label,
        text: el.text,
        value: el.value,
        bounds: el.bounds,
        disabled: el.disabled,
        hidden: el.hidden
      }))
    };
  }
  async clickElement(tabId, elementId) {
    const { view, el } = this.resolve(tabId, elementId);
    if (el.disabled) {
      this.pushConsole(view, "warn", `click ignored on disabled <${el.tag}>`);
      return;
    }
    if (el.href) {
      this.pushConsole(view, "info", `navigating via link to ${el.href}`);
      this.loadURL(tabId, el.href);
      return;
    }
    if (el.tag === "button") {
      view.clicks += 1;
      el.text = `Clicked ${view.clicks}`;
      this.pushConsole(view, "log", `button clicked (count=${view.clicks})`);
      this.emit(tabId);
      return;
    }
    this.pushConsole(view, "log", `clicked <${el.tag}>`);
  }
  async typeText(tabId, elementId, text) {
    const { view, el } = this.resolve(tabId, elementId);
    if (el.tag !== "input" && el.tag !== "textarea") {
      throw new Error(`Cannot type into a <${el.tag}> element`);
    }
    if (el.disabled) throw new Error("Cannot type into a disabled element");
    el.value = text;
    this.pushConsole(view, "log", `typed ${text.length} chars`);
    this.emit(tabId);
  }
  async scrollPage(tabId, options) {
    const view = this.requireView(tabId);
    if (options.toX !== void 0) view.scrollX = Math.max(0, options.toX);
    else if (options.deltaX) view.scrollX = Math.max(0, view.scrollX + options.deltaX);
    if (options.toY !== void 0) view.scrollY = Math.max(0, options.toY);
    else if (options.deltaY) view.scrollY = Math.max(0, view.scrollY + options.deltaY);
  }
  async sendKeys(tabId, keys) {
    const view = this.requireView(tabId);
    this.pushConsole(view, "log", `keys: ${keys}`);
  }
  async sendCdp(tabId, method, params = {}) {
    const view = this.requireView(tabId);
    switch (method) {
      case "Page.navigate": {
        const url = typeof params.url === "string" ? params.url : view.url;
        this.loadURL(tabId, url);
        return { frameId: "headless-frame", loaderId: "headless-loader" };
      }
      case "Page.reload":
        this.reload(tabId);
        return {};
      case "Runtime.evaluate": {
        const expression = typeof params.expression === "string" ? params.expression : "";
        return { result: { type: "string", value: expression } };
      }
      case "Page.getNavigationHistory":
        return {
          currentIndex: view.cursor,
          entries: view.history.map((url, id) => ({ id, url, title: titleFromUrl(url) }))
        };
      default:
        return { simulated: true, method };
    }
  }
  getConsoleLogs(tabId, limit) {
    const view = this.views.get(tabId);
    if (!view) return [];
    return limit ? view.console.slice(-limit) : [...view.console];
  }
  getNetworkLogs(tabId, limit) {
    const view = this.views.get(tabId);
    if (!view) return [];
    return limit ? view.network.slice(-limit) : [...view.network];
  }
  // --- internals ---
  /** Rebuild the synthetic DOM and record a navigation in console + network. */
  onNavigated(view, url) {
    view.clicks = 0;
    view.scrollX = 0;
    view.scrollY = 0;
    view.elements = buildElements(url);
    this.pushConsole(view, "info", `navigated to ${url}`);
    const started = Date.now();
    view.network.push({
      id: `net-${++networkSeq}`,
      method: "GET",
      url,
      status: 200,
      resourceType: "document",
      startedAt: started,
      endedAt: started + 1,
      durationMs: 1,
      failed: false
    });
    if (view.network.length > MAX_LOG$1) view.network.shift();
  }
  pushConsole(view, level, text) {
    view.console.push({ level, text, ts: Date.now() });
    if (view.console.length > MAX_LOG$1) view.console.shift();
  }
  resolve(tabId, elementId) {
    const view = this.requireView(tabId);
    const idx = parseElementIndex(elementId);
    const el = idx === null ? void 0 : view.elements[idx];
    if (!el) throw new ElementNotFoundError(tabId, elementId);
    return { view, el };
  }
  requireView(tabId) {
    const view = this.views.get(tabId);
    if (!view) throw new Error(`No live view for tab ${tabId}`);
    return view;
  }
  toNavState(view) {
    return {
      url: view.url,
      title: view.title,
      loadState: view.loadState,
      canGoBack: view.cursor > 0,
      canGoForward: view.cursor < view.history.length - 1
    };
  }
  emit(tabId) {
    const view = this.views.get(tabId);
    if (!view) return;
    const state = this.toNavState(view);
    for (const cb of this.listeners) cb(tabId, state);
  }
}
function buildElements(url) {
  const origin = originOf(url);
  return [
    {
      tag: "a",
      role: "link",
      label: "Next page",
      text: "Next page",
      href: `${origin}/next`,
      bounds: { x: 16, y: 16, width: 120, height: 24 },
      disabled: false,
      hidden: false
    },
    {
      tag: "button",
      role: "button",
      label: "Increment",
      text: "Increment",
      bounds: { x: 16, y: 56, width: 120, height: 32 },
      disabled: false,
      hidden: false
    },
    {
      tag: "input",
      role: "textbox",
      label: "Search",
      value: "",
      bounds: { x: 16, y: 104, width: 240, height: 32 },
      disabled: false,
      hidden: false
    }
  ];
}
function parseElementIndex(elementId) {
  const m = /^el-(\d+)$/.exec(elementId);
  return m ? Number(m[1]) : null;
}
function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/+$/, "");
  }
}
function titleFromUrl(url) {
  try {
    const u = new URL(url);
    return u.host || url;
  } catch {
    return url;
  }
}
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
class TabOwnershipError extends Error {
  constructor(tabId, ownerId) {
    super(`Tab ${tabId} is currently controlled by owner ${ownerId}`);
    this.tabId = tabId;
    this.ownerId = ownerId;
    this.name = "TabOwnershipError";
  }
}
class TabClaimRequiredError extends Error {
  constructor(tabId) {
    super(`Tab ${tabId} must be claimed via browser_use_start before control`);
    this.tabId = tabId;
    this.name = "TabClaimRequiredError";
  }
}
class BrowserTabService {
  constructor(appState, logger, options = {}) {
    this.appState = appState;
    this.logger = logger;
    this.host = options.host ?? new HeadlessBrowserViewHost();
    this.artifacts = options.artifacts;
    this.host.onNavStateChanged((tabId, nav) => this.applyNavState(tabId, nav));
  }
  host;
  artifacts;
  activeSpaceId() {
    const state = this.appState.getState();
    return state.activeSpaceId ?? state.spaces[0]?.id ?? "default";
  }
  getTab(id) {
    return this.appState.getState().browserTabs.find((t) => t.id === id);
  }
  /**
   * Throw unless `control` is allowed to mutate `tab`:
   *  - if the tab is claimed by someone else -> `TabOwnershipError`;
   *  - if the tab is unclaimed and the caller requires a claim
   *    (automation) -> `TabClaimRequiredError`.
   */
  assertControl(tab, control) {
    if (tab.ownerId) {
      if (tab.ownerId !== control.ownerId) {
        throw new TabOwnershipError(tab.id, tab.ownerId);
      }
      return;
    }
    if (control.requireClaim) {
      throw new TabClaimRequiredError(tab.id);
    }
  }
  /**
   * Ensure a live view exists for a persisted tab, recreating it lazily (e.g.
   * after an app restart, when only the tab record survived). Safe to call
   * repeatedly: it no-ops when the host already has the view.
   */
  async ensureView(tab) {
    if (this.host.getNavState(tab.id) === null) {
      await this.host.createView(tab.id, tab.url);
    }
  }
  /**
   * Recreate live views for all persisted tabs and focus the active tab so the
   * window shows content immediately after startup. Call once during bootstrap.
   */
  async hydrate() {
    const tabs = this.appState.getState().browserTabs;
    for (const tab of tabs) {
      await this.ensureView(tab);
    }
    const active = this.getActiveBrowserTab();
    if (active) await this.host.focusView(active.id);
  }
  listBrowserTabs(spaceId) {
    const tabs = this.appState.getState().browserTabs;
    return spaceId ? tabs.filter((t) => t.spaceId === spaceId) : tabs;
  }
  listWorkspaceTabs(spaceId) {
    const tabs = this.appState.getState().workspaceTabs;
    return spaceId ? tabs.filter((t) => t.spaceId === spaceId) : tabs;
  }
  getActiveBrowserTab(spaceId) {
    const sid = spaceId ?? this.activeSpaceId();
    return this.appState.getState().browserTabs.find((t) => t.spaceId === sid && t.active) ?? null;
  }
  async openBrowserTab(input) {
    const spaceId = input.spaceId ?? this.activeSpaceId();
    const tab = {
      id: newBrowserTabId(),
      spaceId,
      url: input.url,
      title: input.title ?? input.url,
      cwd: input.cwd,
      active: true,
      createdAt: Date.now(),
      loadState: "loading",
      canGoBack: false,
      canGoForward: false,
      ownerId: null
    };
    this.appState.update((draft) => {
      for (const t of draft.browserTabs) {
        if (t.spaceId === spaceId) t.active = false;
      }
      draft.browserTabs.push(tab);
    }, "open_browser_tab");
    await this.host.createView(tab.id, tab.url);
    await this.host.focusView(tab.id);
    this.logger.info("BrowserTabs", `opened browser tab ${tab.id} -> ${tab.url}`);
    return this.getTab(tab.id) ?? tab;
  }
  async navigate(id, url, control = {}) {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    this.appState.update((draft) => {
      const t = draft.browserTabs.find((b) => b.id === id);
      if (t) {
        t.url = url;
        t.loadState = "loading";
      }
    }, "navigate");
    if (this.host.getNavState(id) === null) {
      await this.host.createView(id, url);
    } else {
      await this.host.loadURL(id, url);
    }
    this.logger.info("BrowserTabs", `navigate ${id} -> ${url}`);
    return this.requireTab(id);
  }
  async goBack(id, control = {}) {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    await this.ensureView(tab);
    await this.host.goBack(id);
    return this.requireTab(id);
  }
  async goForward(id, control = {}) {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    await this.ensureView(tab);
    await this.host.goForward(id);
    return this.requireTab(id);
  }
  async refresh(id, control = {}) {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    await this.ensureView(tab);
    await this.host.reload(id);
    return this.requireTab(id);
  }
  async focusBrowserTab(id) {
    const tab = this.requireTab(id);
    this.appState.update((draft) => {
      for (const t of draft.browserTabs) {
        if (t.spaceId === tab.spaceId) t.active = t.id === id;
      }
    }, "focus_browser_tab");
    await this.ensureView(tab);
    await this.host.focusView(id);
    return this.requireTab(id);
  }
  async closeBrowserTab(id, control = {}) {
    const tab = this.getTab(id);
    if (!tab) return false;
    this.assertControl(tab, control);
    let removed = false;
    let nextActiveId = null;
    this.appState.update((draft) => {
      const before = draft.browserTabs.length;
      draft.browserTabs = draft.browserTabs.filter((t) => t.id !== id);
      removed = draft.browserTabs.length < before;
      if (removed && tab.active) {
        const sameSpace = draft.browserTabs.filter((t) => t.spaceId === tab.spaceId);
        const last = sameSpace[sameSpace.length - 1];
        if (last) {
          last.active = true;
          nextActiveId = last.id;
        }
      }
    }, "close_browser_tab");
    await this.host.destroyView(id);
    if (nextActiveId) {
      const next = this.getTab(nextActiveId);
      if (next) {
        await this.ensureView(next);
        await this.host.focusView(nextActiveId);
      }
    }
    if (removed) this.logger.info("BrowserTabs", `closed browser tab ${id}`);
    return removed;
  }
  /**
   * Claim exclusive automation control of a tab. Returns the session owner id.
   * Throws `TabOwnershipError` if another owner already holds it.
   */
  startUse(id, ownerId) {
    const tab = this.requireTab(id);
    if (tab.ownerId && tab.ownerId !== ownerId) {
      throw new TabOwnershipError(id, tab.ownerId);
    }
    this.appState.update((draft) => {
      const t = draft.browserTabs.find((b) => b.id === id);
      if (t) t.ownerId = ownerId;
    }, "browser_use_start");
    this.logger.info("BrowserTabs", `owner ${ownerId} claimed tab ${id}`);
    return this.requireTab(id);
  }
  /** Release automation control. Only the current owner (or force) may release. */
  endUse(id, ownerId, force = false) {
    const tab = this.requireTab(id);
    if (tab.ownerId && tab.ownerId !== ownerId && !force) {
      throw new TabOwnershipError(id, tab.ownerId);
    }
    this.appState.update((draft) => {
      const t = draft.browserTabs.find((b) => b.id === id);
      if (t) t.ownerId = null;
    }, "browser_use_end");
    this.logger.info("BrowserTabs", `owner ${ownerId} released tab ${id}`);
    return this.requireTab(id);
  }
  /** Release any tabs held by an owner (e.g. on session end/crash). */
  releaseOwner(ownerId) {
    this.appState.update((draft) => {
      for (const t of draft.browserTabs) {
        if (t.ownerId === ownerId) t.ownerId = null;
      }
    }, "browser_release_owner");
  }
  /**
   * Capture a screenshot of a tab. Persists a PNG artifact when an
   * `ArtifactStore` is configured and returns a structured descriptor.
   */
  async captureScreenshot(id) {
    const tab = this.requireTab(id);
    await this.ensureView(tab);
    const capture = await this.host.capture(id);
    if (!capture) {
      throw new Error(`No live view to capture for tab ${id}`);
    }
    let path;
    if (this.artifacts) {
      const info = this.artifacts.write(
        `screenshot-${id}-${Date.now()}`,
        "png",
        capture.data
      );
      path = info.path;
    }
    return { tabId: id, width: capture.width, height: capture.height, path };
  }
  // --- Automation & diagnostics (Phase 4) ---
  /**
   * Extract the page's interactable/semantic elements (read-only). Recreates
   * the live view if it was lost so callers don't see spurious failures.
   */
  async getBrowserState(id) {
    const tab = this.requireTab(id);
    await this.ensureView(tab);
    const state = await this.host.getBrowserState(id);
    if (!state) throw new Error(`No live view for tab ${id}`);
    return { tabId: id, ...state };
  }
  /** Click an element by an id from the most recent `getBrowserState`. */
  async clickElement(id, elementId, control = {}) {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    await this.ensureView(tab);
    await this.host.clickElement(id, elementId);
    this.logger.info("BrowserTabs", `click ${elementId} on tab ${id}`);
  }
  /** Type text into an element by id (replaces its existing value). */
  async typeText(id, elementId, text, control = {}) {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    await this.ensureView(tab);
    await this.host.typeText(id, elementId, text);
    this.logger.info("BrowserTabs", `type into ${elementId} on tab ${id}`);
  }
  /** Scroll the page by a delta or to an absolute position. */
  async scrollPage(id, options, control = {}) {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    await this.ensureView(tab);
    await this.host.scrollPage(id, options);
  }
  /** Dispatch a key (named) or literal characters to the focused element/page. */
  async sendKeys(id, keys, control = {}) {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    await this.ensureView(tab);
    await this.host.sendKeys(id, keys);
  }
  /** Issue a raw CDP command against a tab (treated as a control operation). */
  async cdpCommand(id, method, params, control = {}) {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    await this.ensureView(tab);
    const result = await this.host.sendCdp(id, method, params);
    return { tabId: id, method, result };
  }
  /** Read captured console messages for a tab (read-only). */
  async getConsoleLogs(id, limit) {
    const tab = this.requireTab(id);
    await this.ensureView(tab);
    return this.host.getConsoleLogs(id, limit);
  }
  /** Read observed network requests for a tab (read-only). */
  async getNetworkLogs(id, limit) {
    const tab = this.requireTab(id);
    await this.ensureView(tab);
    return this.host.getNetworkLogs(id, limit);
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
  /** Make a workspace tab the active one within its space. */
  focusWorkspaceTab(id) {
    const tab = this.appState.getState().workspaceTabs.find((t) => t.id === id);
    if (!tab) throw new Error(`Unknown workspace tab: ${id}`);
    this.appState.update((draft) => {
      for (const t of draft.workspaceTabs) {
        if (t.spaceId === tab.spaceId) t.active = t.id === id;
      }
    }, "focus_workspace_tab");
    const next = this.appState.getState().workspaceTabs.find((t) => t.id === id);
    if (!next) throw new Error(`Unknown workspace tab: ${id}`);
    return next;
  }
  /** Close a workspace tab; activates the most recent remaining tab in-space. */
  closeWorkspaceTab(id) {
    const tab = this.appState.getState().workspaceTabs.find((t) => t.id === id);
    if (!tab) return false;
    let removed = false;
    this.appState.update((draft) => {
      const before = draft.workspaceTabs.length;
      draft.workspaceTabs = draft.workspaceTabs.filter((t) => t.id !== id);
      removed = draft.workspaceTabs.length < before;
      if (removed && tab.active) {
        const sameSpace = draft.workspaceTabs.filter((t) => t.spaceId === tab.spaceId);
        const last = sameSpace[sameSpace.length - 1];
        if (last) last.active = true;
      }
    }, "close_workspace_tab");
    if (removed) this.logger.info("WorkspaceTabs", `closed workspace tab ${id}`);
    return removed;
  }
  requireTab(id) {
    const tab = this.getTab(id);
    if (!tab) throw new Error(`Unknown browser tab: ${id}`);
    return tab;
  }
  /** Merge a host nav-state update into the persisted tab record. */
  applyNavState(tabId, nav) {
    if (!this.getTab(tabId)) return;
    this.appState.update((draft) => {
      const t = draft.browserTabs.find((b) => b.id === tabId);
      if (!t) return;
      if (nav.url !== void 0) t.url = nav.url;
      if (nav.title !== void 0) t.title = nav.title;
      if (nav.faviconUrl !== void 0) t.faviconUrl = nav.faviconUrl;
      if (nav.loadState !== void 0) t.loadState = nav.loadState;
      if (nav.canGoBack !== void 0) t.canGoBack = nav.canGoBack;
      if (nav.canGoForward !== void 0) t.canGoForward = nav.canGoForward;
    }, "browser_nav_state");
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
class SpaceService {
  constructor(appState, logger) {
    this.appState = appState;
    this.logger = logger;
  }
  list() {
    return this.appState.getState().spaces;
  }
  getActiveSpaceId() {
    return this.appState.getState().activeSpaceId;
  }
  /** Create a space and make it active. */
  create(input) {
    const space = {
      id: newSpaceId(),
      name: input.name.trim() || "Untitled",
      color: input.color,
      createdAt: Date.now()
    };
    this.appState.update((draft) => {
      draft.spaces.push(space);
      draft.activeSpaceId = space.id;
    }, "create_space");
    this.logger.info("Spaces", `created space ${space.id} (${space.name})`);
    return space;
  }
  /** Rename and/or recolor an existing space. */
  update(id, patch) {
    const exists = this.appState.getState().spaces.some((s) => s.id === id);
    if (!exists) throw new Error(`Unknown space: ${id}`);
    this.appState.update((draft) => {
      const space = draft.spaces.find((s) => s.id === id);
      if (!space) return;
      if (patch.name !== void 0) space.name = patch.name.trim() || space.name;
      if (patch.color !== void 0) space.color = patch.color;
    }, "update_space");
    const next = this.appState.getState().spaces.find((s) => s.id === id);
    if (!next) throw new Error(`Unknown space: ${id}`);
    return next;
  }
  /** Switch the active space. */
  switchTo(id) {
    const space = this.appState.getState().spaces.find((s) => s.id === id);
    if (!space) throw new Error(`Unknown space: ${id}`);
    this.appState.update((draft) => {
      draft.activeSpaceId = id;
    }, "switch_space");
    this.logger.info("Spaces", `switched to space ${id}`);
    return space;
  }
  /**
   * Close (archive) a space and all of its tabs. The last space cannot be
   * closed so there is always a valid active space. If the active space is
   * closed, the most recent remaining space becomes active.
   */
  close(id) {
    const state = this.appState.getState();
    if (state.spaces.length <= 1) {
      throw new Error("Cannot close the last remaining space");
    }
    if (!state.spaces.some((s) => s.id === id)) return false;
    this.appState.update((draft) => {
      draft.spaces = draft.spaces.filter((s) => s.id !== id);
      draft.browserTabs = draft.browserTabs.filter((t) => t.spaceId !== id);
      draft.workspaceTabs = draft.workspaceTabs.filter((t) => t.spaceId !== id);
      if (draft.activeSpaceId === id) {
        draft.activeSpaceId = draft.spaces[draft.spaces.length - 1]?.id ?? null;
      }
    }, "close_space");
    this.logger.info("Spaces", `closed space ${id}`);
    return true;
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
        `rejecting client protocol ${msg.protocol} != server ${PROTOCOL_VERSION}`
      );
      const requestId = "requestId" in msg ? msg.requestId : void 0;
      send({
        type: "error",
        ...requestId ? { requestId } : {},
        code: "PROTOCOL_ERROR",
        message: `Unsupported protocol version ${msg.protocol}; server requires ${PROTOCOL_VERSION}`
      });
      return;
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
class ArtifactStore {
  dir;
  constructor(dataDir) {
    this.dir = join(dataDir, "artifacts");
  }
  get directory() {
    return this.dir;
  }
  /** Persist bytes and return the absolute path written. */
  write(id, ext, data) {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    const fileName = `${id}.${ext.replace(/^\./, "")}`;
    const path = join(this.dir, fileName);
    writeFileSync(path, data);
    return { id, path, sizeBytes: data.byteLength, createdAt: Date.now() };
  }
  list() {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir).map((name) => {
      const path = join(this.dir, name);
      const st = statSync(path);
      return {
        id: name.replace(/\.[^.]+$/, ""),
        path,
        sizeBytes: st.size,
        createdAt: st.birthtimeMs || st.mtimeMs
      };
    });
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
const AUTOMATION_CALLERS = /* @__PURE__ */ new Set(["agent", "plugin"]);
async function guardOwnership(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof TabOwnershipError) {
      throw new ToolError("PERMISSION_DENIED", err.message, {
        tabId: err.tabId,
        ownerId: err.ownerId
      });
    }
    if (err instanceof TabClaimRequiredError) {
      throw new ToolError("PERMISSION_DENIED", err.message, {
        tabId: err.tabId,
        reason: "claim_required"
      });
    }
    throw err;
  }
}
function ownerOf(ctx, explicit) {
  return explicit ?? ctx.sessionId ?? ctx.caller;
}
function controlFor(ctx, explicit) {
  return {
    ownerId: ownerOf(ctx, explicit),
    requireClaim: AUTOMATION_CALLERS.has(ctx.caller)
  };
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
  const getActiveTab = defineTool({
    name: "get_active_tab",
    description: "Return the active browser tab for a space (or the active space).",
    capabilities: ["read-only"],
    inputSchema: z.object({ spaceId: z.string().optional() }),
    execute: (_ctx, input) => deps.browserTabs.getActiveBrowserTab(input.spaceId)
  });
  const openBrowserTab = defineTool({
    name: "open_browser_tab",
    description: "Open a new browser tab pointing at a URL and focus it.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({
      url: z.string().describe("URL to open, e.g. http://localhost:3000"),
      title: z.string().optional(),
      spaceId: z.string().optional(),
      cwd: z.string().optional().describe("Optional associated project cwd.")
    }),
    execute: (_ctx, input) => deps.browserTabs.openBrowserTab(input)
  });
  const navigate = defineTool({
    name: "navigate",
    description: "Navigate an existing browser tab to a new URL.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({
      tabId: z.string(),
      url: z.string(),
      owner: z.string().optional().describe("Automation owner id, if claimed.")
    }),
    execute: (ctx, input) => guardOwnership(
      () => deps.browserTabs.navigate(input.tabId, input.url, controlFor(ctx, input.owner))
    )
  });
  const goBack = defineTool({
    name: "go_back",
    description: "Navigate a browser tab back in its history.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({ tabId: z.string(), owner: z.string().optional() }),
    execute: (ctx, input) => guardOwnership(
      () => deps.browserTabs.goBack(input.tabId, controlFor(ctx, input.owner))
    )
  });
  const goForward = defineTool({
    name: "go_forward",
    description: "Navigate a browser tab forward in its history.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({ tabId: z.string(), owner: z.string().optional() }),
    execute: (ctx, input) => guardOwnership(
      () => deps.browserTabs.goForward(input.tabId, controlFor(ctx, input.owner))
    )
  });
  const refresh = defineTool({
    name: "refresh",
    description: "Reload a browser tab.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({ tabId: z.string(), owner: z.string().optional() }),
    execute: (ctx, input) => guardOwnership(
      () => deps.browserTabs.refresh(input.tabId, controlFor(ctx, input.owner))
    )
  });
  const focusBrowserTab = defineTool({
    name: "focus_browser_tab",
    description: "Make a browser tab the active/visible tab in its space.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({ tabId: z.string() }),
    execute: (_ctx, input) => deps.browserTabs.focusBrowserTab(input.tabId)
  });
  const closeBrowserTab = defineTool({
    name: "close_browser_tab",
    description: "Close a browser tab and destroy its live view.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({ tabId: z.string(), owner: z.string().optional() }),
    execute: (ctx, input) => guardOwnership(async () => ({
      closed: await deps.browserTabs.closeBrowserTab(
        input.tabId,
        controlFor(ctx, input.owner)
      )
    }))
  });
  const browserUseStart = defineTool({
    name: "browser_use_start",
    description: "Claim exclusive automation control of a browser tab. Prevents other agents/tools from controlling it concurrently.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({
      tabId: z.string(),
      owner: z.string().optional().describe("Owner id; defaults to the session id.")
    }),
    execute: (ctx, input) => guardOwnership(
      () => deps.browserTabs.startUse(input.tabId, ownerOf(ctx, input.owner))
    )
  });
  const browserUseEnd = defineTool({
    name: "browser_use_end",
    description: "Release automation control of a browser tab.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({
      tabId: z.string(),
      owner: z.string().optional(),
      force: z.boolean().optional().describe("Release even if owned by another id.")
    }),
    execute: (ctx, input) => guardOwnership(
      () => deps.browserTabs.endUse(
        input.tabId,
        ownerOf(ctx, input.owner),
        input.force ?? false
      )
    )
  });
  const getBrowserState = defineTool({
    name: "get_browser_state",
    description: "Extract a browser tab's interactable elements (with stable ids), plus url/title/viewport. Use the returned element ids with click_element and type_text.",
    capabilities: ["read-only", "controls-browser"],
    inputSchema: z.object({ tabId: z.string() }),
    execute: (_ctx, input) => deps.browserTabs.getBrowserState(input.tabId)
  });
  const clickElement = defineTool({
    name: "click_element",
    description: "Click an element by an id from the latest get_browser_state.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({
      tabId: z.string(),
      elementId: z.string().describe("Element id from get_browser_state, e.g. el-2."),
      owner: z.string().optional()
    }),
    execute: (ctx, input) => guardOwnership(async () => {
      await deps.browserTabs.clickElement(
        input.tabId,
        input.elementId,
        controlFor(ctx, input.owner)
      );
      return { clicked: input.elementId };
    })
  });
  const typeText = defineTool({
    name: "type_text",
    description: "Focus an element (by get_browser_state id) and type text, replacing its current value.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({
      tabId: z.string(),
      elementId: z.string(),
      text: z.string(),
      owner: z.string().optional()
    }),
    execute: (ctx, input) => guardOwnership(async () => {
      await deps.browserTabs.typeText(
        input.tabId,
        input.elementId,
        input.text,
        controlFor(ctx, input.owner)
      );
      return { typed: input.text.length };
    })
  });
  const scrollPage = defineTool({
    name: "scroll_page",
    description: "Scroll a browser tab by a relative delta (deltaX/deltaY) or to an absolute position (toX/toY).",
    capabilities: ["controls-browser"],
    inputSchema: z.object({
      tabId: z.string(),
      deltaX: z.number().optional(),
      deltaY: z.number().optional(),
      toX: z.number().optional(),
      toY: z.number().optional(),
      owner: z.string().optional()
    }),
    execute: (ctx, input) => guardOwnership(async () => {
      await deps.browserTabs.scrollPage(
        input.tabId,
        { deltaX: input.deltaX, deltaY: input.deltaY, toX: input.toX, toY: input.toY },
        controlFor(ctx, input.owner)
      );
      return { ok: true };
    })
  });
  const sendKeys = defineTool({
    name: "send_keys",
    description: "Dispatch keyboard input to the focused element/page. Use a named key (Enter, Tab, Backspace, ArrowDown, ...) or literal characters.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({
      tabId: z.string(),
      keys: z.string(),
      owner: z.string().optional()
    }),
    execute: (ctx, input) => guardOwnership(async () => {
      await deps.browserTabs.sendKeys(
        input.tabId,
        input.keys,
        controlFor(ctx, input.owner)
      );
      return { ok: true };
    })
  });
  const cdpCommand = defineTool({
    name: "cdp_command",
    description: "Issue a raw Chrome DevTools Protocol command against a tab (e.g. Page.navigate, Runtime.evaluate). Treated as browser control.",
    capabilities: ["controls-browser", "accesses-network"],
    inputSchema: z.object({
      tabId: z.string(),
      method: z.string().describe("CDP method, e.g. Runtime.evaluate."),
      params: z.record(z.unknown()).optional(),
      owner: z.string().optional()
    }),
    execute: (ctx, input) => guardOwnership(
      () => deps.browserTabs.cdpCommand(
        input.tabId,
        input.method,
        input.params ?? {},
        controlFor(ctx, input.owner)
      )
    )
  });
  const getConsoleLogs = defineTool({
    name: "get_console_logs",
    description: "Return console messages captured for a browser tab (most recent last).",
    capabilities: ["read-only"],
    inputSchema: z.object({
      tabId: z.string(),
      limit: z.number().int().positive().optional()
    }),
    execute: (_ctx, input) => deps.browserTabs.getConsoleLogs(input.tabId, input.limit)
  });
  const getNetworkLogs = defineTool({
    name: "get_network_logs",
    description: "Return network requests observed for a browser tab (most recent last).",
    capabilities: ["read-only", "accesses-network"],
    inputSchema: z.object({
      tabId: z.string(),
      limit: z.number().int().positive().optional()
    }),
    execute: (_ctx, input) => deps.browserTabs.getNetworkLogs(input.tabId, input.limit)
  });
  const takeScreenshot = defineTool({
    name: "take_screenshot",
    description: "Capture a screenshot of a browser tab using the live view. Persists a PNG artifact when storage is available.",
    capabilities: ["controls-browser", "read-only"],
    inputSchema: z.object({ tabId: z.string() }),
    execute: async (_ctx, input) => {
      try {
        return await deps.browserTabs.captureScreenshot(input.tabId);
      } catch (err) {
        throw new ToolError(
          "TOOL_FAILED",
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  });
  return [
    getTabs,
    getActiveTab,
    openBrowserTab,
    navigate,
    goBack,
    goForward,
    refresh,
    focusBrowserTab,
    closeBrowserTab,
    browserUseStart,
    browserUseEnd,
    takeScreenshot,
    getBrowserState,
    clickElement,
    typeText,
    scrollPage,
    sendKeys,
    cdpCommand,
    getConsoleLogs,
    getNetworkLogs
  ];
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
function createSpaceTools(deps) {
  const listSpaces = defineTool({
    name: "list_spaces",
    description: "List all spaces and the active space id.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => ({
      spaces: deps.spaces.list(),
      activeSpaceId: deps.spaces.getActiveSpaceId()
    })
  });
  const createSpace = defineTool({
    name: "create_space",
    description: "Create a new space and make it active.",
    capabilities: [],
    inputSchema: z.object({
      name: z.string().min(1),
      color: z.string().optional()
    }),
    execute: (_ctx, input) => deps.spaces.create(input)
  });
  const updateSpace = defineTool({
    name: "update_space",
    description: "Rename and/or recolor a space.",
    capabilities: [],
    inputSchema: z.object({
      spaceId: z.string(),
      name: z.string().min(1).optional(),
      color: z.string().optional()
    }),
    execute: (_ctx, input) => deps.spaces.update(input.spaceId, { name: input.name, color: input.color })
  });
  const switchSpace = defineTool({
    name: "switch_space",
    description: "Switch the active space.",
    capabilities: [],
    inputSchema: z.object({ spaceId: z.string() }),
    execute: (_ctx, input) => deps.spaces.switchTo(input.spaceId)
  });
  const closeSpace = defineTool({
    name: "close_space",
    description: "Close (archive) a space and its tabs. The last space cannot be closed.",
    capabilities: ["destructive"],
    inputSchema: z.object({ spaceId: z.string() }),
    execute: (_ctx, input) => ({ closed: deps.spaces.close(input.spaceId) })
  });
  const openWorkspaceTab = defineTool({
    name: "open_workspace_tab",
    description: "Open a workspace tab (editor/terminal/agent/preview) in the active space.",
    capabilities: [],
    inputSchema: z.object({
      title: z.string().min(1),
      cwd: z.string().min(1),
      kind: z.enum(["editor", "terminal", "agent", "preview"]).optional(),
      spaceId: z.string().optional()
    }),
    execute: (_ctx, input) => deps.browserTabs.openWorkspaceTab(input)
  });
  const focusWorkspaceTab = defineTool({
    name: "focus_workspace_tab",
    description: "Make a workspace tab the active one in its space.",
    capabilities: [],
    inputSchema: z.object({ tabId: z.string() }),
    execute: (_ctx, input) => deps.browserTabs.focusWorkspaceTab(input.tabId)
  });
  const closeWorkspaceTab = defineTool({
    name: "close_workspace_tab",
    description: "Close a workspace tab.",
    capabilities: [],
    inputSchema: z.object({ tabId: z.string() }),
    execute: (_ctx, input) => ({
      closed: deps.browserTabs.closeWorkspaceTab(input.tabId)
    })
  });
  return [
    listSpaces,
    createSpace,
    updateSpace,
    switchSpace,
    closeSpace,
    openWorkspaceTab,
    focusWorkspaceTab,
    closeWorkspaceTab
  ];
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
async function bootstrap(userDataPath, options = {}) {
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
  const artifacts = new ArtifactStore(join(userDataPath, "artifacts"));
  const browserTabs = new BrowserTabService(appState, logger, {
    host: options.browserViewHost,
    artifacts
  });
  const spaces = new SpaceService(appState, logger);
  const devServers = new DevServerService(logger);
  const terminals = new TerminalService(logger);
  const projects = new ProjectService(logger);
  const storage = new StorageService({ dataDir: userDataPath, appState, logPath });
  const registry = new ToolRegistry();
  const deps = { appState, browserTabs, spaces, devServers, logger, storage };
  registry.registerAll(createBrowserTools(deps));
  registry.registerAll(createSpaceTools(deps));
  registry.registerAll(createAppTools(deps));
  registry.registerAll(createStorageTools(deps));
  const agents = new AgentService(registry, logger);
  const socket = new ToolSocketService(socketPath, registry, logger);
  await socket.start();
  await browserTabs.hydrate();
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
    spaces,
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
const MAX_LOG = 1e3;
class ElectronBrowserViewHost extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
  }
  views = /* @__PURE__ */ new Map();
  activeTabId = null;
  /** Last viewport reported by the renderer; takes precedence over fallback. */
  explicitBounds = null;
  /**
   * Set the content region from the renderer's measured layout. This is the
   * viewport contract: the native view is sized to wherever the renderer says
   * browser content belongs, instead of a hard-coded inset.
   */
  setContentBounds(bounds) {
    this.explicitBounds = bounds;
    this.layout();
  }
  createView(tabId, url) {
    if (this.views.has(tabId)) {
      this.loadURL(tabId, url);
      return;
    }
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: this.options.preloadPath
      }
    });
    const managed = {
      view,
      nav: { url, loadState: "loading", canGoBack: false, canGoForward: false },
      debuggerAttached: false,
      console: [],
      network: [],
      netByRequestId: /* @__PURE__ */ new Map(),
      knownElementIds: /* @__PURE__ */ new Set()
    };
    this.views.set(tabId, managed);
    this.wireEvents(tabId, managed);
    this.attachDebugger(tabId, managed);
    void view.webContents.loadURL(url).catch(() => this.markFailed(tabId));
  }
  loadURL(tabId, url) {
    const managed = this.views.get(tabId);
    if (!managed) return;
    managed.nav.url = url;
    managed.nav.loadState = "loading";
    this.emitNav(tabId, managed);
    void managed.view.webContents.loadURL(url).catch(() => this.markFailed(tabId));
  }
  destroyView(tabId) {
    const managed = this.views.get(tabId);
    if (!managed) return;
    const win = this.options.getWindow();
    win?.contentView.removeChildView(managed.view);
    if (managed.debuggerAttached) {
      try {
        managed.view.webContents.debugger.detach();
      } catch {
      }
    }
    managed.view.webContents.close();
    this.views.delete(tabId);
    if (this.activeTabId === tabId) this.activeTabId = null;
  }
  focusView(tabId) {
    if (!this.views.has(tabId)) return;
    this.activeTabId = tabId;
    this.attachActiveView();
  }
  /**
   * Attach the active view to the window and size it. No-ops if the window
   * doesn't exist yet; call again from the main process once the window is
   * created/ready to resolve the startup race.
   */
  attachActiveView() {
    const win = this.options.getWindow();
    if (!win || !this.activeTabId) return;
    const managed = this.views.get(this.activeTabId);
    if (!managed) return;
    for (const [id, other] of this.views) {
      if (id !== this.activeTabId) win.contentView.removeChildView(other.view);
    }
    win.contentView.addChildView(managed.view);
    this.layout();
    managed.view.webContents.focus();
  }
  reload(tabId) {
    this.views.get(tabId)?.view.webContents.reload();
  }
  goBack(tabId) {
    const nav = this.views.get(tabId)?.view.webContents.navigationHistory;
    if (nav?.canGoBack()) nav.goBack();
  }
  goForward(tabId) {
    const nav = this.views.get(tabId)?.view.webContents.navigationHistory;
    if (nav?.canGoForward()) nav.goForward();
  }
  async capture(tabId) {
    const managed = this.views.get(tabId);
    if (!managed) return null;
    const image = await managed.view.webContents.capturePage();
    const size = image.getSize();
    return { data: image.toPNG(), width: size.width, height: size.height };
  }
  getNavState(tabId) {
    return this.views.get(tabId)?.nav ?? null;
  }
  onNavStateChanged(cb) {
    this.on("nav", cb);
  }
  // --- Automation & diagnostics ---
  async getBrowserState(tabId) {
    const managed = this.views.get(tabId);
    if (!managed) return null;
    const wc = managed.view.webContents;
    const raw = await wc.executeJavaScript(EXTRACT_SCRIPT, true);
    managed.knownElementIds = new Set(raw.elements.map((el) => el.id));
    return raw;
  }
  async clickElement(tabId, elementId) {
    const managed = this.requireKnownElement(tabId, elementId);
    const wc = managed.view.webContents;
    const ok = await wc.executeJavaScript(
      `(${INTERACT_FN})(${JSON.stringify(elementId)}, "click")`,
      true
    );
    if (!ok) throw new ElementNotFoundError(tabId, elementId);
  }
  async typeText(tabId, elementId, text) {
    const managed = this.requireKnownElement(tabId, elementId);
    const wc = managed.view.webContents;
    const ok = await wc.executeJavaScript(
      `(${INTERACT_FN})(${JSON.stringify(elementId)}, "type", ${JSON.stringify(text)})`,
      true
    );
    if (!ok) throw new ElementNotFoundError(tabId, elementId);
  }
  async scrollPage(tabId, options) {
    const managed = this.views.get(tabId);
    if (!managed) return;
    const wc = managed.view.webContents;
    if (options.toX !== void 0 || options.toY !== void 0) {
      await wc.executeJavaScript(
        `window.scrollTo(${options.toX ?? 0}, ${options.toY ?? 0})`,
        true
      );
    } else {
      await wc.executeJavaScript(
        `window.scrollBy(${options.deltaX ?? 0}, ${options.deltaY ?? 0})`,
        true
      );
    }
  }
  async sendKeys(tabId, keys) {
    const managed = this.views.get(tabId);
    if (!managed) return;
    const wc = managed.view.webContents;
    const named = NAMED_KEYS[keys];
    if (named) {
      wc.sendInputEvent({ type: "keyDown", keyCode: named });
      wc.sendInputEvent({ type: "keyUp", keyCode: named });
      return;
    }
    for (const ch of keys) {
      wc.sendInputEvent({ type: "char", keyCode: ch });
    }
  }
  async sendCdp(tabId, method, params = {}) {
    const managed = this.views.get(tabId);
    if (!managed) throw new Error(`No live view for tab ${tabId}`);
    this.ensureDebugger(tabId, managed);
    return managed.view.webContents.debugger.sendCommand(method, params);
  }
  getConsoleLogs(tabId, limit) {
    const managed = this.views.get(tabId);
    if (!managed) return [];
    return limit ? managed.console.slice(-limit) : [...managed.console];
  }
  getNetworkLogs(tabId, limit) {
    const managed = this.views.get(tabId);
    if (!managed) return [];
    return limit ? managed.network.slice(-limit) : [...managed.network];
  }
  /** Re-apply the content region to the active view (call on window resize). */
  layout() {
    if (!this.activeTabId) return;
    const managed = this.views.get(this.activeTabId);
    if (!managed) return;
    managed.view.setBounds(this.resolveBounds());
  }
  /** Renderer-reported bounds win; otherwise fall back to the option/default. */
  resolveBounds() {
    if (this.explicitBounds) return this.explicitBounds;
    if (this.options.getContentBounds) return this.options.getContentBounds();
    const [width, height] = this.options.getWindow()?.getContentSize() ?? [1280, 820];
    return { x: 0, y: 0, width, height };
  }
  wireEvents(tabId, managed) {
    const wc = managed.view.webContents;
    const sync = (patch) => {
      Object.assign(managed.nav, patch, {
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
        url: wc.getURL() || managed.nav.url
      });
      this.emitNav(tabId, managed);
    };
    wc.on("did-start-loading", () => sync({ loadState: "loading" }));
    wc.on("did-stop-loading", () => sync({ loadState: "complete" }));
    wc.on("did-fail-load", (_e, code) => {
      if (code !== -3) sync({ loadState: "failed" });
    });
    wc.on("page-title-updated", (_e, title) => sync({ title }));
    wc.on("page-favicon-updated", (_e, favicons) => sync({ faviconUrl: favicons[0] }));
  }
  /** Attach the CDP debugger and enable diagnostics domains for a view. */
  attachDebugger(tabId, managed) {
    const wc = managed.view.webContents;
    try {
      wc.debugger.attach("1.3");
    } catch {
      return;
    }
    managed.debuggerAttached = true;
    wc.debugger.on("detach", () => {
      managed.debuggerAttached = false;
    });
    wc.debugger.on(
      "message",
      (_e, method, params) => this.handleCdpMessage(tabId, method, params)
    );
    for (const domain of [
      "Page.enable",
      "Runtime.enable",
      "Network.enable",
      "Log.enable"
    ]) {
      void wc.debugger.sendCommand(domain).catch(() => {
      });
    }
  }
  /** Ensure the debugger is attached before a raw CDP command. */
  ensureDebugger(tabId, managed) {
    if (!managed.debuggerAttached) this.attachDebugger(tabId, managed);
    if (!managed.debuggerAttached) {
      throw new Error(`CDP debugger unavailable for tab ${tabId}`);
    }
  }
  /** Resolve a view and verify the element id came from a recent extraction. */
  requireKnownElement(tabId, elementId) {
    const managed = this.views.get(tabId);
    if (!managed) throw new Error(`No live view for tab ${tabId}`);
    if (!managed.knownElementIds.has(elementId)) {
      throw new ElementNotFoundError(tabId, elementId);
    }
    return managed;
  }
  /** Translate CDP events into the per-tab console/network buffers. */
  handleCdpMessage(tabId, method, params) {
    const managed = this.views.get(tabId);
    if (!managed) return;
    switch (method) {
      case "Runtime.consoleAPICalled": {
        const type = String(params.type ?? "log");
        const args = params.args ?? [];
        const text = args.map((a) => a.value !== void 0 ? String(a.value) : a.description ?? "").join(" ");
        this.pushConsole(managed, { level: consoleLevel(type), text, ts: Date.now() });
        break;
      }
      case "Log.entryAdded": {
        const entry = params.entry ?? {};
        this.pushConsole(managed, {
          level: consoleLevel(String(entry.level ?? "info")),
          text: String(entry.text ?? ""),
          ts: Date.now(),
          source: entry.url ? String(entry.url) : void 0
        });
        break;
      }
      case "Network.requestWillBeSent": {
        const request = params.request ?? {};
        const entry = {
          id: String(params.requestId),
          method: String(request.method ?? "GET"),
          url: String(request.url ?? ""),
          resourceType: params.type ? String(params.type) : void 0,
          startedAt: Date.now(),
          failed: false
        };
        managed.netByRequestId.set(entry.id, entry);
        this.pushNetwork(managed, entry);
        break;
      }
      case "Network.responseReceived": {
        const response = params.response ?? {};
        const entry = managed.netByRequestId.get(String(params.requestId));
        if (entry) entry.status = Number(response.status ?? 0);
        break;
      }
      case "Network.loadingFinished": {
        const entry = managed.netByRequestId.get(String(params.requestId));
        if (entry) {
          entry.endedAt = Date.now();
          entry.durationMs = entry.endedAt - entry.startedAt;
          managed.netByRequestId.delete(entry.id);
        }
        break;
      }
      case "Network.loadingFailed": {
        const entry = managed.netByRequestId.get(String(params.requestId));
        if (entry) {
          entry.failed = true;
          entry.errorText = params.errorText ? String(params.errorText) : "failed";
          entry.endedAt = Date.now();
          entry.durationMs = entry.endedAt - entry.startedAt;
          managed.netByRequestId.delete(entry.id);
        }
        break;
      }
    }
  }
  pushConsole(managed, entry) {
    managed.console.push(entry);
    if (managed.console.length > MAX_LOG) managed.console.shift();
  }
  pushNetwork(managed, entry) {
    managed.network.push(entry);
    if (managed.network.length > MAX_LOG) managed.network.shift();
  }
  markFailed(tabId) {
    const managed = this.views.get(tabId);
    if (!managed) return;
    managed.nav.loadState = "failed";
    this.emitNav(tabId, managed);
  }
  emitNav(tabId, managed) {
    this.emit("nav", tabId, { ...managed.nav });
  }
}
function consoleLevel(type) {
  switch (type) {
    case "error":
    case "assert":
      return "error";
    case "warning":
    case "warn":
      return "warn";
    case "debug":
    case "verbose":
      return "debug";
    case "info":
      return "info";
    default:
      return "log";
  }
}
const NAMED_KEYS = {
  Enter: "Return",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Escape: "Escape",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown"
};
const EXTRACT_SCRIPT = `(() => {
  const SEL = 'a,button,input,textarea,select,[role="button"],[role="link"],[role="textbox"],[role="checkbox"],[onclick]';
  const nodes = Array.from(document.querySelectorAll(SEL));
  const elements = [];
  let i = 0;
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    const hidden = style.display === 'none' || style.visibility === 'hidden' || (rect.width === 0 && rect.height === 0);
    const id = 'el-' + i++;
    node.setAttribute('data-meith-id', id);
    const label = node.getAttribute('aria-label') || node.getAttribute('placeholder') || node.getAttribute('name') || (node.labels && node.labels[0] && node.labels[0].innerText) || '';
    elements.push({
      id,
      tag: node.tagName.toLowerCase(),
      role: node.getAttribute('role') || undefined,
      label: label || undefined,
      text: (node.innerText || node.value || '').trim().slice(0, 200) || undefined,
      value: typeof node.value === 'string' ? node.value : undefined,
      bounds: { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height },
      disabled: !!node.disabled || node.getAttribute('aria-disabled') === 'true',
      hidden,
    });
  }
  return {
    url: location.href,
    title: document.title,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    elements,
  };
})()`;
const INTERACT_FN = `function(id, action, text) {
  const el = document.querySelector('[data-meith-id="' + id + '"]');
  if (!el) return false;
  el.scrollIntoView({ block: 'center', inline: 'center' });
  if (action === 'click') {
    el.focus && el.focus();
    el.click();
    return true;
  }
  if (action === 'type') {
    el.focus && el.focus();
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, text);
    else el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
}`;
const IPC = {
  toolsList: "meith:tools:list",
  toolCall: "meith:tools:call",
  getState: "meith:state:get",
  stateChanged: "meith:state:changed",
  getLogs: "meith:logs:get",
  logEntry: "meith:logs:entry",
  /** Renderer -> main (one-way): measured browser content viewport bounds. */
  browserViewport: "meith:browser:viewport"
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
const FALLBACK_CHROME_TOP = 96;
let mainWindow = null;
let container = null;
let viewHost = null;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
    viewHost?.attachActiveView();
  });
  mainWindow.on("resize", () => viewHost?.layout());
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}
app.whenReady().then(async () => {
  viewHost = new ElectronBrowserViewHost({
    getWindow: () => mainWindow,
    preloadPath: join(__dirname, "../preload/webContent.cjs"),
    getContentBounds: () => {
      const [width, height] = mainWindow?.getContentSize() ?? [1280, 820];
      return {
        x: 0,
        y: FALLBACK_CHROME_TOP,
        width,
        height: Math.max(0, height - FALLBACK_CHROME_TOP)
      };
    }
  });
  createWindow();
  container = await bootstrap(app.getPath("userData"), { browserViewHost: viewHost });
  registerIpcHandlers(container, () => mainWindow);
  ipcMain.on(IPC.browserViewport, (_event, raw) => {
    const parsed = BrowserViewportSchema.safeParse(raw);
    if (parsed.success) viewHost?.setContentBounds(parsed.data);
  });
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
