import { EventEmitter } from "node:events";
import type { BrowserWindow, WebContentsView as WebContentsViewType } from "electron";
import { WebContentsView } from "electron";
import type { BrowserViewHost, ViewCapture, ViewNavState } from "./BrowserViewHost.js";

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
   * Returns the current content region (area below the app chrome). Recomputed
   * on focus and on `layout()` so views track window/sidebar resizes.
   */
  getContentBounds: () => ContentBounds;
}

interface ManagedView {
  view: WebContentsViewType;
  nav: ViewNavState;
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

  constructor(private readonly options: ElectronBrowserViewHostOptions) {
    super();
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
    };
    this.views.set(tabId, managed);
    this.wireEvents(tabId, managed);
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
    // close() releases the underlying web contents.
    managed.view.webContents.close();
    this.views.delete(tabId);
    if (this.activeTabId === tabId) this.activeTabId = null;
  }

  focusView(tabId: string): void {
    const managed = this.views.get(tabId);
    const win = this.options.getWindow();
    if (!managed || !win) return;
    // Detach all other views, attach + size the focused one.
    for (const [id, other] of this.views) {
      if (id !== tabId) win.contentView.removeChildView(other.view);
    }
    win.contentView.addChildView(managed.view);
    this.activeTabId = tabId;
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

  /** Re-apply the content region to the active view (call on window resize). */
  layout(): void {
    if (!this.activeTabId) return;
    const managed = this.views.get(this.activeTabId);
    if (!managed) return;
    managed.view.setBounds(this.options.getContentBounds());
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
    wc.on("page-favicon-updated", (_e, favicons) =>
      sync({ faviconUrl: favicons[0] }),
    );
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
