import type { BrowserViewHost, ViewCapture, ViewNavState } from "./BrowserViewHost.js";

interface HeadlessView {
  url: string;
  title: string;
  history: string[];
  /** Index into `history` for the currently displayed entry. */
  cursor: number;
  loadState: ViewNavState["loadState"];
}

/**
 * In-memory `BrowserViewHost` with no Electron dependency.
 *
 * It maintains a per-tab history stack so back/forward, reload, and navigation
 * behave realistically for tests and the socket-only runtime. `capture()`
 * returns a tiny generated PNG so the screenshot/artifact path is exercised
 * end-to-end without a real renderer.
 */
export class HeadlessBrowserViewHost implements BrowserViewHost {
  private readonly views = new Map<string, HeadlessView>();
  private readonly listeners: ((tabId: string, state: ViewNavState) => void)[] = [];

  createView(tabId: string, url: string): void {
    this.views.set(tabId, {
      url,
      title: titleFromUrl(url),
      history: [url],
      cursor: 0,
      loadState: "complete",
    });
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
    this.emit(tabId);
  }

  goBack(tabId: string): void {
    const view = this.views.get(tabId);
    if (!view || view.cursor <= 0) return;
    view.cursor -= 1;
    view.url = view.history[view.cursor];
    view.title = titleFromUrl(view.url);
    this.emit(tabId);
  }

  goForward(tabId: string): void {
    const view = this.views.get(tabId);
    if (!view || view.cursor >= view.history.length - 1) return;
    view.cursor += 1;
    view.url = view.history[view.cursor];
    view.title = titleFromUrl(view.url);
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
