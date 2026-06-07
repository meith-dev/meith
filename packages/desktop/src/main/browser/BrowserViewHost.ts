import type {
  BrowserElement,
  BrowserLoadState,
  ConsoleLogEntry,
  NetworkLogEntry,
} from "@meith/shared";

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

/** Extracted page state returned by a host's `getBrowserState`. */
export interface ViewBrowserState {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  elements: BrowserElement[];
}

/** How to scroll a page: by a relative delta or to an absolute position. */
export interface ScrollOptions {
  /** Relative vertical scroll in CSS pixels (positive = down). */
  deltaY?: number;
  /** Relative horizontal scroll in CSS pixels (positive = right). */
  deltaX?: number;
  /** Absolute target (overrides deltas when provided). */
  toX?: number;
  toY?: number;
}

/**
 * Raised by a host when an interaction targets an element id that is not part
 * of the most recent extraction (stale handle or unknown id).
 */
export class ElementNotFoundError extends Error {
  constructor(
    public readonly tabId: string,
    public readonly elementId: string,
  ) {
    super(`Element ${elementId} not found in tab ${tabId}`);
    this.name = "ElementNotFoundError";
  }
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

  // --- Automation & diagnostics (Phase 4) ---

  /**
   * Extract the page's interactable/semantic elements plus url/title/viewport.
   * Assigns stable element ids usable by `clickElement`/`typeText` until the
   * next extraction. Returns null when the view doesn't exist.
   */
  getBrowserState(tabId: string): Promise<ViewBrowserState | null>;
  /** Click an element by an id from the most recent `getBrowserState`. */
  clickElement(tabId: string, elementId: string): Promise<void>;
  /** Focus an element and type text into it (replaces existing value). */
  typeText(tabId: string, elementId: string, text: string): Promise<void>;
  /** Scroll the page by a delta or to an absolute position. */
  scrollPage(tabId: string, options: ScrollOptions): Promise<void>;
  /** Dispatch a sequence of keyboard keys to the focused element/page. */
  sendKeys(tabId: string, keys: string): Promise<void>;
  /**
   * Issue a raw Chrome DevTools Protocol command against the tab's target.
   * Returns the method-specific result. Hosts without a real CDP backend
   * implement a small simulated subset.
   */
  sendCdp(
    tabId: string,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown>;
  /** Console messages captured for a tab (most recent last). */
  getConsoleLogs(tabId: string, limit?: number): ConsoleLogEntry[];
  /** Network requests observed for a tab (most recent last). */
  getNetworkLogs(tabId: string, limit?: number): NetworkLogEntry[];
}
