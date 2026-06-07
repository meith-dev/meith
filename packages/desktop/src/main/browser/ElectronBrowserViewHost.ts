import { EventEmitter } from "node:events";
import type {
  ConsoleLogEntry,
  NetworkLogEntry,
} from "@meith/shared";
import type { BrowserWindow, WebContentsView as WebContentsViewType } from "electron";
import { WebContentsView } from "electron";
import {
  type BrowserViewHost,
  ElementNotFoundError,
  type ScrollOptions,
  type ViewBrowserState,
  type ViewCapture,
  type ViewNavState,
} from "./BrowserViewHost.js";

/** Cap per-tab diagnostics buffers so long-lived tabs don't grow unbounded. */
const MAX_LOG = 1000;

/** Pixel region (within the main window) where browser content is rendered. */
export interface ContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElectronBrowserViewHostOptions {
  /** Returns the window that hosts the browser content views. */
  getWindow: () => BrowserWindow | null;
  /** Preload script applied to all web-content views (safe message bridge). */
  preloadPath?: string;
  /**
   * Fallback content region used until the renderer reports a measured
   * viewport via `setContentBounds()`. Optional; defaults to filling the
   * window content area below a small inset.
   */
  getContentBounds?: () => ContentBounds;
}

interface ManagedView {
  view: WebContentsViewType;
  nav: ViewNavState;
  /** Whether the CDP debugger is attached for diagnostics. */
  debuggerAttached: boolean;
  /** Captured console messages (ring buffer). */
  console: ConsoleLogEntry[];
  /** Captured network requests (ring buffer). */
  network: NetworkLogEntry[];
  /** In-flight network entries keyed by CDP requestId. */
  netByRequestId: Map<string, NetworkLogEntry>;
  /** Element ids assigned during the last `getBrowserState` extraction. */
  knownElementIds: Set<string>;
}

/**
 * Backs each browser tab with a real Electron `WebContentsView`.
 *
 * Web content runs with `nodeIntegration: false` and `contextIsolation: true`;
 * only the optional preload's safe bridge is exposed. Inactive views are
 * detached from the window (hidden); the focused view is attached and sized to
 * the content region. This class is constructed only by the Electron main
 * entry and injected into `bootstrap()`, keeping the rest of the runtime
 * Electron-free.
 */
export class ElectronBrowserViewHost extends EventEmitter implements BrowserViewHost {
  private readonly views = new Map<string, ManagedView>();
  private activeTabId: string | null = null;
  /** Last viewport reported by the renderer; takes precedence over fallback. */
  private explicitBounds: ContentBounds | null = null;

  constructor(private readonly options: ElectronBrowserViewHostOptions) {
    super();
  }

  /**
   * Set the content region from the renderer's measured layout. This is the
   * viewport contract: the native view is sized to wherever the renderer says
   * browser content belongs, instead of a hard-coded inset.
   */
  setContentBounds(bounds: ContentBounds): void {
    this.explicitBounds = bounds;
    this.layout();
  }

  createView(tabId: string, url: string): void {
    if (this.views.has(tabId)) {
      this.loadURL(tabId, url);
      return;
    }
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: this.options.preloadPath,
      },
    });
    const managed: ManagedView = {
      view,
      nav: { url, loadState: "loading", canGoBack: false, canGoForward: false },
      debuggerAttached: false,
      console: [],
      network: [],
      netByRequestId: new Map(),
      knownElementIds: new Set(),
    };
    this.views.set(tabId, managed);
    this.wireEvents(tabId, managed);
    this.attachDebugger(tabId, managed);
    void view.webContents.loadURL(url).catch(() => this.markFailed(tabId));
  }

  loadURL(tabId: string, url: string): void {
    const managed = this.views.get(tabId);
    if (!managed) return;
    managed.nav.url = url;
    managed.nav.loadState = "loading";
    this.emitNav(tabId, managed);
    void managed.view.webContents.loadURL(url).catch(() => this.markFailed(tabId));
  }

  destroyView(tabId: string): void {
    const managed = this.views.get(tabId);
    if (!managed) return;
    const win = this.options.getWindow();
    win?.contentView.removeChildView(managed.view);
    // Detach the debugger before closing so Electron doesn't warn.
    if (managed.debuggerAttached) {
      try {
        managed.view.webContents.debugger.detach();
      } catch {
        // Already detached or contents gone; ignore.
      }
    }
    // close() releases the underlying web contents.
    managed.view.webContents.close();
    this.views.delete(tabId);
    if (this.activeTabId === tabId) this.activeTabId = null;
  }

  focusView(tabId: string): void {
    if (!this.views.has(tabId)) return;
    // Record intent even if the window isn't ready yet; attachActiveView()
    // (called on window creation/ready) will attach it once it exists.
    this.activeTabId = tabId;
    this.attachActiveView();
  }

  /**
   * Attach the active view to the window and size it. No-ops if the window
   * doesn't exist yet; call again from the main process once the window is
   * created/ready to resolve the startup race.
   */
  attachActiveView(): void {
    const win = this.options.getWindow();
    if (!win || !this.activeTabId) return;
    const managed = this.views.get(this.activeTabId);
    if (!managed) return;
    // Detach all other views, attach + size the focused one.
    for (const [id, other] of this.views) {
      if (id !== this.activeTabId) win.contentView.removeChildView(other.view);
    }
    win.contentView.addChildView(managed.view);
    this.layout();
    managed.view.webContents.focus();
  }

  reload(tabId: string): void {
    this.views.get(tabId)?.view.webContents.reload();
  }

  goBack(tabId: string): void {
    const nav = this.views.get(tabId)?.view.webContents.navigationHistory;
    if (nav?.canGoBack()) nav.goBack();
  }

  goForward(tabId: string): void {
    const nav = this.views.get(tabId)?.view.webContents.navigationHistory;
    if (nav?.canGoForward()) nav.goForward();
  }

  async capture(tabId: string): Promise<ViewCapture | null> {
    const managed = this.views.get(tabId);
    if (!managed) return null;
    const image = await managed.view.webContents.capturePage();
    const size = image.getSize();
    return { data: image.toPNG(), width: size.width, height: size.height };
  }

  getNavState(tabId: string): ViewNavState | null {
    return this.views.get(tabId)?.nav ?? null;
  }

  onNavStateChanged(cb: (tabId: string, state: ViewNavState) => void): void {
    this.on("nav", cb);
  }

  // --- Automation & diagnostics ---

  async getBrowserState(tabId: string): Promise<ViewBrowserState | null> {
    const managed = this.views.get(tabId);
    if (!managed) return null;
    const wc = managed.view.webContents;
    const raw = (await wc.executeJavaScript(EXTRACT_SCRIPT, true)) as ViewBrowserState;
    // Remember which ids are valid so interactions can reject stale handles.
    managed.knownElementIds = new Set(raw.elements.map((el) => el.id));
    return raw;
  }

  async clickElement(tabId: string, elementId: string): Promise<void> {
    const managed = this.requireKnownElement(tabId, elementId);
    const wc = managed.view.webContents;
    const ok = (await wc.executeJavaScript(
      `(${INTERACT_FN})(${JSON.stringify(elementId)}, "click")`,
      true,
    )) as boolean;
    if (!ok) throw new ElementNotFoundError(tabId, elementId);
  }

  async typeText(tabId: string, elementId: string, text: string): Promise<void> {
    const managed = this.requireKnownElement(tabId, elementId);
    const wc = managed.view.webContents;
    const ok = (await wc.executeJavaScript(
      `(${INTERACT_FN})(${JSON.stringify(elementId)}, "type", ${JSON.stringify(text)})`,
      true,
    )) as boolean;
    if (!ok) throw new ElementNotFoundError(tabId, elementId);
  }

  async scrollPage(tabId: string, options: ScrollOptions): Promise<void> {
    const managed = this.views.get(tabId);
    if (!managed) return;
    const wc = managed.view.webContents;
    if (options.toX !== undefined || options.toY !== undefined) {
      await wc.executeJavaScript(
        `window.scrollTo(${options.toX ?? 0}, ${options.toY ?? 0})`,
        true,
      );
    } else {
      await wc.executeJavaScript(
        `window.scrollBy(${options.deltaX ?? 0}, ${options.deltaY ?? 0})`,
        true,
      );
    }
  }

  async sendKeys(tabId: string, keys: string): Promise<void> {
    const managed = this.views.get(tabId);
    if (!managed) return;
    const wc = managed.view.webContents;
    const named = NAMED_KEYS[keys];
    if (named) {
      // Dispatch a discrete key press through the input pipeline.
      wc.sendInputEvent({ type: "keyDown", keyCode: named });
      wc.sendInputEvent({ type: "keyUp", keyCode: named });
      return;
    }
    // Treat anything else as literal characters typed into the focused element.
    for (const ch of keys) {
      wc.sendInputEvent({ type: "char", keyCode: ch });
    }
  }

  async sendCdp(
    tabId: string,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    const managed = this.views.get(tabId);
    if (!managed) throw new Error(`No live view for tab ${tabId}`);
    this.ensureDebugger(tabId, managed);
    return managed.view.webContents.debugger.sendCommand(method, params);
  }

  getConsoleLogs(tabId: string, limit?: number): ConsoleLogEntry[] {
    const managed = this.views.get(tabId);
    if (!managed) return [];
    return limit ? managed.console.slice(-limit) : [...managed.console];
  }

  getNetworkLogs(tabId: string, limit?: number): NetworkLogEntry[] {
    const managed = this.views.get(tabId);
    if (!managed) return [];
    return limit ? managed.network.slice(-limit) : [...managed.network];
  }

  /** Re-apply the content region to the active view (call on window resize). */
  layout(): void {
    if (!this.activeTabId) return;
    const managed = this.views.get(this.activeTabId);
    if (!managed) return;
    managed.view.setBounds(this.resolveBounds());
  }

  /** Renderer-reported bounds win; otherwise fall back to the option/default. */
  private resolveBounds(): ContentBounds {
    if (this.explicitBounds) return this.explicitBounds;
    if (this.options.getContentBounds) return this.options.getContentBounds();
    const [width, height] = this.options.getWindow()?.getContentSize() ?? [1280, 820];
    return { x: 0, y: 0, width, height };
  }

  private wireEvents(tabId: string, managed: ManagedView): void {
    const wc = managed.view.webContents;
    const sync = (patch: Partial<ViewNavState>) => {
      Object.assign(managed.nav, patch, {
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
        url: wc.getURL() || managed.nav.url,
      });
      this.emitNav(tabId, managed);
    };
    wc.on("did-start-loading", () => sync({ loadState: "loading" }));
    wc.on("did-stop-loading", () => sync({ loadState: "complete" }));
    wc.on("did-fail-load", (_e, code) => {
      // Ignore aborts (-3) caused by normal in-page navigation.
      if (code !== -3) sync({ loadState: "failed" });
    });
    wc.on("page-title-updated", (_e, title) => sync({ title }));
    wc.on("page-favicon-updated", (_e, favicons) => sync({ faviconUrl: favicons[0] }));
  }

  /** Attach the CDP debugger and enable diagnostics domains for a view. */
  private attachDebugger(tabId: string, managed: ManagedView): void {
    const wc = managed.view.webContents;
    try {
      wc.debugger.attach("1.3");
    } catch {
      // Another client (e.g. DevTools) is attached; diagnostics degrade
      // gracefully — console/network buffers stay empty and sendCdp will throw.
      return;
    }
    managed.debuggerAttached = true;
    wc.debugger.on("detach", () => {
      managed.debuggerAttached = false;
    });
    wc.debugger.on("message", (_e, method, params) =>
      this.handleCdpMessage(tabId, method, params as Record<string, unknown>),
    );
    // Enable the domains we mine for diagnostics. Ignore failures per-domain.
    for (const domain of ["Page.enable", "Runtime.enable", "Network.enable", "Log.enable"]) {
      void wc.debugger.sendCommand(domain).catch(() => {});
    }
  }

  /** Ensure the debugger is attached before a raw CDP command. */
  private ensureDebugger(tabId: string, managed: ManagedView): void {
    if (!managed.debuggerAttached) this.attachDebugger(tabId, managed);
    if (!managed.debuggerAttached) {
      throw new Error(`CDP debugger unavailable for tab ${tabId}`);
    }
  }

  /** Resolve a view and verify the element id came from a recent extraction. */
  private requireKnownElement(tabId: string, elementId: string): ManagedView {
    const managed = this.views.get(tabId);
    if (!managed) throw new Error(`No live view for tab ${tabId}`);
    if (!managed.knownElementIds.has(elementId)) {
      throw new ElementNotFoundError(tabId, elementId);
    }
    return managed;
  }

  /** Translate CDP events into the per-tab console/network buffers. */
  private handleCdpMessage(
    tabId: string,
    method: string,
    params: Record<string, unknown>,
  ): void {
    const managed = this.views.get(tabId);
    if (!managed) return;
    switch (method) {
      case "Runtime.consoleAPICalled": {
        const type = String(params.type ?? "log");
        const args = (params.args as { value?: unknown; description?: string }[]) ?? [];
        const text = args
          .map((a) => (a.value !== undefined ? String(a.value) : (a.description ?? "")))
          .join(" ");
        this.pushConsole(managed, { level: consoleLevel(type), text, ts: Date.now() });
        break;
      }
      case "Log.entryAdded": {
        const entry = (params.entry as Record<string, unknown>) ?? {};
        this.pushConsole(managed, {
          level: consoleLevel(String(entry.level ?? "info")),
          text: String(entry.text ?? ""),
          ts: Date.now(),
          source: entry.url ? String(entry.url) : undefined,
        });
        break;
      }
      case "Network.requestWillBeSent": {
        const request = (params.request as Record<string, unknown>) ?? {};
        const entry: NetworkLogEntry = {
          id: String(params.requestId),
          method: String(request.method ?? "GET"),
          url: String(request.url ?? ""),
          resourceType: params.type ? String(params.type) : undefined,
          startedAt: Date.now(),
          failed: false,
        };
        managed.netByRequestId.set(entry.id, entry);
        this.pushNetwork(managed, entry);
        break;
      }
      case "Network.responseReceived": {
        const response = (params.response as Record<string, unknown>) ?? {};
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
      default:
        break;
    }
  }

  private pushConsole(managed: ManagedView, entry: ConsoleLogEntry): void {
    managed.console.push(entry);
    if (managed.console.length > MAX_LOG) managed.console.shift();
  }

  private pushNetwork(managed: ManagedView, entry: NetworkLogEntry): void {
    managed.network.push(entry);
    if (managed.network.length > MAX_LOG) managed.network.shift();
  }

  private markFailed(tabId: string): void {
    const managed = this.views.get(tabId);
    if (!managed) return;
    managed.nav.loadState = "failed";
    this.emitNav(tabId, managed);
  }

  private emitNav(tabId: string, managed: ManagedView): void {
    this.emit("nav", tabId, { ...managed.nav });
  }
}

/** Map a CDP/console message type to our normalized console level. */
function consoleLevel(type: string): ConsoleLogEntry["level"] {
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

/**
 * Logical key names accepted by `send_keys`, mapped to Electron input keyCodes.
 * Anything not listed is typed as literal characters.
 */
const NAMED_KEYS: Record<string, string> = {
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
  PageDown: "PageDown",
};

/**
 * Injected page script: walk interactable/semantic elements, tag each with a
 * stable `data-meith-id`, and return a structured snapshot. Runs in the page's
 * isolated world via `executeJavaScript` and returns a plain JSON object.
 */
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

/**
 * Injected interaction function: resolve a `data-meith-id` and either click it
 * or set its value (dispatching input/change so frameworks observe the change).
 * Stringified and called with arguments by `clickElement`/`typeText`.
 */
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
