import type { ConsoleLogEntry, ElementBounds, NetworkLogEntry } from "@meith/shared";
import {
  type BrowserViewHost,
  ElementNotFoundError,
  type ScrollOptions,
  type ViewBrowserState,
  type ViewCapture,
  type ViewNavState,
} from "./BrowserViewHost.js";

/** A simulated DOM node maintained per headless view for automation tests. */
interface SimElement {
  tag: string;
  role?: string;
  label?: string;
  text?: string;
  value?: string;
  /** Navigation target for link elements. */
  href?: string;
  bounds: ElementBounds;
  disabled: boolean;
  hidden: boolean;
}

interface HeadlessView {
  url: string;
  title: string;
  history: string[];
  /** Index into `history` for the currently displayed entry. */
  cursor: number;
  loadState: ViewNavState["loadState"];
  /** Synthetic DOM, rebuilt on each navigation. */
  elements: SimElement[];
  /** Number of times the synthetic button has been clicked. */
  clicks: number;
  scrollX: number;
  scrollY: number;
  console: ConsoleLogEntry[];
  network: NetworkLogEntry[];
}

const MAX_LOG = 500;
let networkSeq = 0;

/**
 * In-memory `BrowserViewHost` with no Electron dependency.
 *
 * It maintains a per-tab history stack so back/forward, reload, and navigation
 * behave realistically for tests and the socket-only runtime. `capture()`
 * returns a tiny generated PNG so the screenshot/artifact path is exercised
 * end-to-end without a real renderer.
 *
 * For Phase 4 it also models a small synthetic DOM (a link, a button, and a
 * text input), plus console and network logs, so the full automation/diagnostics
 * tool surface (`get_browser_state`, `click_element`, `type_text`, `scroll_page`,
 * `send_keys`, `cdp_command`, console/network logs) can be exercised without a
 * real browser.
 */
export class HeadlessBrowserViewHost implements BrowserViewHost {
  private readonly views = new Map<string, HeadlessView>();
  private readonly listeners: ((tabId: string, state: ViewNavState) => void)[] = [];

  createView(tabId: string, url: string): void {
    const view: HeadlessView = {
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
      network: [],
    };
    this.views.set(tabId, view);
    this.onNavigated(view, url);
    this.emit(tabId);
  }

  loadURL(tabId: string, url: string): void {
    const view = this.views.get(tabId);
    if (!view) {
      this.createView(tabId, url);
      return;
    }
    // Drop any forward history, then push the new entry.
    view.history = view.history.slice(0, view.cursor + 1);
    view.history.push(url);
    view.cursor = view.history.length - 1;
    view.url = url;
    view.title = titleFromUrl(url);
    view.loadState = "complete";
    this.onNavigated(view, url);
    this.emit(tabId);
  }

  destroyView(tabId: string): void {
    this.views.delete(tabId);
  }

  focusView(_tabId: string): void {
    // No-op in headless mode (no visual stacking).
  }

  reload(tabId: string): void {
    const view = this.views.get(tabId);
    if (!view) return;
    view.loadState = "complete";
    this.onNavigated(view, view.url);
    this.emit(tabId);
  }

  goBack(tabId: string): void {
    const view = this.views.get(tabId);
    if (!view || view.cursor <= 0) return;
    view.cursor -= 1;
    view.url = view.history[view.cursor];
    view.title = titleFromUrl(view.url);
    this.onNavigated(view, view.url);
    this.emit(tabId);
  }

  goForward(tabId: string): void {
    const view = this.views.get(tabId);
    if (!view || view.cursor >= view.history.length - 1) return;
    view.cursor += 1;
    view.url = view.history[view.cursor];
    view.title = titleFromUrl(view.url);
    this.onNavigated(view, view.url);
    this.emit(tabId);
  }

  async capture(tabId: string): Promise<ViewCapture | null> {
    if (!this.views.has(tabId)) return null;
    return { data: PLACEHOLDER_PNG, width: 1, height: 1 };
  }

  getNavState(tabId: string): ViewNavState | null {
    const view = this.views.get(tabId);
    if (!view) return null;
    return this.toNavState(view);
  }

  onNavStateChanged(cb: (tabId: string, state: ViewNavState) => void): void {
    this.listeners.push(cb);
  }

  // --- Automation & diagnostics ---

  async getBrowserState(tabId: string): Promise<ViewBrowserState | null> {
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
        hidden: el.hidden,
      })),
    };
  }

  async clickElement(tabId: string, elementId: string): Promise<void> {
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

  async typeText(tabId: string, elementId: string, text: string): Promise<void> {
    const { view, el } = this.resolve(tabId, elementId);
    if (el.tag !== "input" && el.tag !== "textarea") {
      throw new Error(`Cannot type into a <${el.tag}> element`);
    }
    if (el.disabled) throw new Error("Cannot type into a disabled element");
    el.value = text;
    this.pushConsole(view, "log", `typed ${text.length} chars`);
    this.emit(tabId);
  }

  async scrollPage(tabId: string, options: ScrollOptions): Promise<void> {
    const view = this.requireView(tabId);
    if (options.toX !== undefined) view.scrollX = Math.max(0, options.toX);
    else if (options.deltaX) view.scrollX = Math.max(0, view.scrollX + options.deltaX);
    if (options.toY !== undefined) view.scrollY = Math.max(0, options.toY);
    else if (options.deltaY) view.scrollY = Math.max(0, view.scrollY + options.deltaY);
  }

  async sendKeys(tabId: string, keys: string): Promise<void> {
    const view = this.requireView(tabId);
    this.pushConsole(view, "log", `keys: ${keys}`);
  }

  async sendCdp(
    tabId: string,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<unknown> {
    const view = this.requireView(tabId);
    // Simulate the small CDP subset most useful to automation/tests.
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
        // Echo back the expression's "value" so callers can round-trip.
        const expression = typeof params.expression === "string" ? params.expression : "";
        return { result: { type: "string", value: expression } };
      }
      case "Page.getNavigationHistory":
        return {
          currentIndex: view.cursor,
          entries: view.history.map((url, id) => ({ id, url, title: titleFromUrl(url) })),
        };
      default:
        return { simulated: true, method };
    }
  }

  getConsoleLogs(tabId: string, limit?: number): ConsoleLogEntry[] {
    const view = this.views.get(tabId);
    if (!view) return [];
    return limit ? view.console.slice(-limit) : [...view.console];
  }

  getNetworkLogs(tabId: string, limit?: number): NetworkLogEntry[] {
    const view = this.views.get(tabId);
    if (!view) return [];
    return limit ? view.network.slice(-limit) : [...view.network];
  }

  // --- internals ---

  /** Rebuild the synthetic DOM and record a navigation in console + network. */
  private onNavigated(view: HeadlessView, url: string): void {
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
      failed: false,
    });
    if (view.network.length > MAX_LOG) view.network.shift();
  }

  private pushConsole(
    view: HeadlessView,
    level: ConsoleLogEntry["level"],
    text: string,
  ): void {
    view.console.push({ level, text, ts: Date.now() });
    if (view.console.length > MAX_LOG) view.console.shift();
  }

  private resolve(
    tabId: string,
    elementId: string,
  ): { view: HeadlessView; el: SimElement } {
    const view = this.requireView(tabId);
    const idx = parseElementIndex(elementId);
    const el = idx === null ? undefined : view.elements[idx];
    if (!el) throw new ElementNotFoundError(tabId, elementId);
    return { view, el };
  }

  private requireView(tabId: string): HeadlessView {
    const view = this.views.get(tabId);
    if (!view) throw new Error(`No live view for tab ${tabId}`);
    return view;
  }

  private toNavState(view: HeadlessView): ViewNavState {
    return {
      url: view.url,
      title: view.title,
      loadState: view.loadState,
      canGoBack: view.cursor > 0,
      canGoForward: view.cursor < view.history.length - 1,
    };
  }

  private emit(tabId: string): void {
    const view = this.views.get(tabId);
    if (!view) return;
    const state = this.toNavState(view);
    for (const cb of this.listeners) cb(tabId, state);
  }
}

/** Build a small deterministic synthetic DOM for a URL. */
function buildElements(url: string): SimElement[] {
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
      hidden: false,
    },
    {
      tag: "button",
      role: "button",
      label: "Increment",
      text: "Increment",
      bounds: { x: 16, y: 56, width: 120, height: 32 },
      disabled: false,
      hidden: false,
    },
    {
      tag: "input",
      role: "textbox",
      label: "Search",
      value: "",
      bounds: { x: 16, y: 104, width: 240, height: 32 },
      disabled: false,
      hidden: false,
    },
  ];
}

function parseElementIndex(elementId: string): number | null {
  const m = /^el-(\d+)$/.exec(elementId);
  return m ? Number(m[1]) : null;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/+$/, "");
  }
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host || url;
  } catch {
    return url;
  }
}

/** A minimal valid 1x1 transparent PNG. */
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
