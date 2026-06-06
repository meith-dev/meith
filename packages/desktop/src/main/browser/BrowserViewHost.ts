import type { BrowserLoadState } from "@meith/shared";

/**
 * A snapshot of live navigation state reported by a browser view back to the
 * `BrowserTabService` so it can be merged into persistent tab records.
 */
export interface ViewNavState {
  url?: string;
  title?: string;
  faviconUrl?: string;
  loadState?: BrowserLoadState;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

/** A captured screenshot returned by a host. */
export interface ViewCapture {
  /** Raw PNG bytes. */
  data: Buffer;
  width: number;
  height: number;
}

/**
 * Abstraction over the live browser views owned by the main process.
 *
 * Two implementations exist:
 *  - `HeadlessBrowserViewHost` (default): pure in-memory model with no Electron
 *    dependency, used by the headless harness, the socket-only runtime, and
 *    tests. Navigation is simulated so tool contracts can be exercised fully.
 *  - `ElectronBrowserViewHost`: backs each tab with a real `WebContentsView`,
 *    injected only from the Electron main entry (`main/index.ts`).
 *
 * `BrowserTabService` depends on this interface, never on Electron directly, so
 * `bootstrap()` stays headless-safe.
 */
export interface BrowserViewHost {
  /** Create a live view for a tab and begin loading `url`. */
  createView(tabId: string, url: string): void | Promise<void>;
  /** Navigate an existing view to a new URL. */
  loadURL(tabId: string, url: string): void | Promise<void>;
  /** Destroy the view bound to a tab. */
  destroyView(tabId: string): void | Promise<void>;
  /** Show this tab's view and hide the others (active tab switching). */
  focusView(tabId: string): void | Promise<void>;
  reload(tabId: string): void | Promise<void>;
  goBack(tabId: string): void | Promise<void>;
  goForward(tabId: string): void | Promise<void>;
  /** Capture the current view as a PNG, or null if unsupported/unavailable. */
  capture(tabId: string): Promise<ViewCapture | null>;
  /** Current live navigation state for a tab, if the view exists. */
  getNavState(tabId: string): ViewNavState | null;
  /** Register a callback invoked whenever a view's nav state changes. */
  onNavStateChanged(cb: (tabId: string, state: ViewNavState) => void): void;
}
