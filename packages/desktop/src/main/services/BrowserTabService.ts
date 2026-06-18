import {
  type BrowserState,
  type BrowserTab,
  type ConsoleLogEntry,
  type NetworkLogEntry,
  type WorkspaceTab,
  newBrowserTabId,
  newWorkspaceTabId,
} from "@meith/shared";
import type {
  BrowserViewHost,
  ScrollOptions,
  ViewNavState,
} from "../browser/BrowserViewHost.js";
import { HeadlessBrowserViewHost } from "../browser/HeadlessBrowserViewHost.js";
import type { ArtifactStore } from "../storage/ArtifactStore.js";
import type { AppStateService } from "./AppStateService.js";
import type { Logger } from "./Logger.js";

export interface BrowserTabServiceOptions {
  /** Live view host. Defaults to a headless, in-memory implementation. */
  host?: BrowserViewHost;
  /** Where screenshots are persisted. */
  artifacts?: ArtifactStore;
}

/** Raised when a tab is controlled by another automation owner. */
export class TabOwnershipError extends Error {
  constructor(
    public readonly tabId: string,
    public readonly ownerId: string,
  ) {
    super(`Tab ${tabId} is currently controlled by owner ${ownerId}`);
    this.name = "TabOwnershipError";
  }
}

/**
 * Raised when an automation caller tries to mutate an unclaimed tab. Automated
 * browser control is exclusive: agents/plugins MUST call `startUse()`
 * (`browser_use_start`) before navigating, reloading, or closing a tab.
 */
export class TabClaimRequiredError extends Error {
  constructor(public readonly tabId: string) {
    super(`Tab ${tabId} must be claimed via browser_use_start before control`);
    this.name = "TabClaimRequiredError";
  }
}

/**
 * Identifies who is controlling a tab and whether a prior claim is required.
 *
 * Interactive callers (the renderer UI, the CLI) may control unclaimed tabs
 * directly. Automation callers (agents/plugins) set `requireClaim: true`, which
 * forces them to claim the tab first so concurrent agents cannot fight over it.
 */
export interface ControlContext {
  /** Claim identity of the caller (session/owner id). */
  ownerId?: string;
  /** When true, the tab must already be claimed by `ownerId`. */
  requireClaim?: boolean;
}

/**
 * Owns the browser/workspace tab model AND coordinates the live browser views.
 *
 * Tab records (metadata) live in persistent `AppState`; live `WebContentsView`
 * instances live in the injected `BrowserViewHost`. This service keeps the two
 * in sync: lifecycle methods mutate state and delegate to the host, and host
 * nav-state callbacks flow back into the persisted records.
 */
export class BrowserTabService {
  private readonly host: BrowserViewHost;
  private readonly artifacts?: ArtifactStore;

  constructor(
    private readonly appState: AppStateService,
    private readonly logger: Logger,
    options: BrowserTabServiceOptions = {},
  ) {
    this.host = options.host ?? new HeadlessBrowserViewHost();
    this.artifacts = options.artifacts;

    // Merge live navigation updates back into the persisted tab record.
    this.host.onNavStateChanged((tabId, nav) => this.applyNavState(tabId, nav));
  }

  private activeSpaceId(): string {
    const state = this.appState.getState();
    return state.activeSpaceId ?? state.spaces[0]?.id ?? "default";
  }

  private getTab(id: string): BrowserTab | undefined {
    return this.appState.getState().browserTabs.find((t) => t.id === id);
  }

  /**
   * Throw unless `control` is allowed to mutate `tab`:
   *  - if the tab is claimed by someone else -> `TabOwnershipError`;
   *  - if the tab is unclaimed and the caller requires a claim
   *    (automation) -> `TabClaimRequiredError`.
   */
  private assertControl(tab: BrowserTab, control: ControlContext): void {
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
  private async ensureView(tab: BrowserTab): Promise<void> {
    if (this.host.getNavState(tab.id) === null) {
      await this.host.createView(tab.id, tab.url, {
        mode: tab.mode,
        pluginId: tab.pluginId,
      });
    }
  }

  /**
   * Recreate live views for all persisted tabs and focus the active tab so the
   * window shows content immediately after startup. Call once during bootstrap.
   */
  async hydrate(): Promise<void> {
    const tabs = this.appState.getState().browserTabs;
    for (const tab of tabs) {
      await this.ensureView(tab);
    }
    const active = this.getActiveBrowserTab();
    if (active) await this.host.focusView(active.id);
  }

  /**
   * List browser tabs. Plugin-mode tabs are EXCLUDED by default so that agents
   * and plugins don't see (or try to automate) the plugin host surfaces of
   * other plugins. Pass `includePlugins: true` for diagnostics/UI that needs
   * the full set.
   */
  listBrowserTabs(spaceId?: string, opts?: { includePlugins?: boolean }): BrowserTab[] {
    const tabs = this.appState.getState().browserTabs;
    const inSpace = spaceId ? tabs.filter((t) => t.spaceId === spaceId) : tabs;
    return opts?.includePlugins ? inSpace : inSpace.filter((t) => t.mode !== "plugin");
  }

  listWorkspaceTabs(spaceId?: string): WorkspaceTab[] {
    const tabs = this.appState.getState().workspaceTabs;
    return spaceId ? tabs.filter((t) => t.spaceId === spaceId) : tabs;
  }

  getActiveBrowserTab(spaceId?: string): BrowserTab | null {
    const sid = spaceId ?? this.activeSpaceId();
    return (
      this.appState.getState().browserTabs.find((t) => t.spaceId === sid && t.active) ??
      null
    );
  }

  async openBrowserTab(input: {
    url: string;
    title?: string;
    spaceId?: string;
    cwd?: string;
    /** Tab mode. `plugin` tabs host a meith plugin and get the plugin preload. */
    mode?: "web" | "plugin";
    /** For `plugin` tabs: the installed plugin id this tab hosts. */
    pluginId?: string;
  }): Promise<BrowserTab> {
    const spaceId = input.spaceId ?? this.activeSpaceId();
    const mode = input.mode ?? "web";
    const tab: BrowserTab = {
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
      ownerId: null,
      mode,
      pluginId: mode === "plugin" ? input.pluginId : undefined,
    };
    this.appState.update((draft) => {
      for (const t of draft.browserTabs) {
        if (t.spaceId === spaceId) t.active = false;
      }
      draft.browserTabs.push(tab);
    }, "open_browser_tab");

    await this.host.createView(tab.id, tab.url, {
      mode,
      pluginId: tab.pluginId,
    });
    await this.host.focusView(tab.id);
    this.logger.info(
      "BrowserTabs",
      `opened ${mode} tab ${tab.id} -> ${tab.url}${tab.pluginId ? ` (plugin ${tab.pluginId})` : ""}`,
    );
    return this.getTab(tab.id) ?? tab;
  }

  async navigate(
    id: string,
    url: string,
    control: ControlContext = {},
  ): Promise<BrowserTab> {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    this.appState.update((draft) => {
      const t = draft.browserTabs.find((b) => b.id === id);
      if (t) {
        t.url = url;
        t.loadState = "loading";
      }
    }, "navigate");
    // Create the view straight at the target URL if it doesn't exist yet
    // (e.g. a rehydrated tab), otherwise navigate the existing view.
    if (this.host.getNavState(id) === null) {
      await this.host.createView(id, url);
    } else {
      await this.host.loadURL(id, url);
    }
    this.logger.info("BrowserTabs", `navigate ${id} -> ${url}`);
    return this.requireTab(id);
  }

  async goBack(id: string, control: ControlContext = {}): Promise<BrowserTab> {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    await this.ensureView(tab);
    await this.host.goBack(id);
    return this.requireTab(id);
  }

  async goForward(id: string, control: ControlContext = {}): Promise<BrowserTab> {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    await this.ensureView(tab);
    await this.host.goForward(id);
    return this.requireTab(id);
  }

  async refresh(id: string, control: ControlContext = {}): Promise<BrowserTab> {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    await this.ensureView(tab);
    await this.host.reload(id);
    return this.requireTab(id);
  }

  async focusBrowserTab(id: string): Promise<BrowserTab> {
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

  async closeBrowserTab(id: string, control: ControlContext = {}): Promise<boolean> {
    const tab = this.getTab(id);
    if (!tab) return false;
    this.assertControl(tab, control);
    let removed = false;
    let nextActiveId: string | null = null;
    this.appState.update((draft) => {
      const before = draft.browserTabs.length;
      draft.browserTabs = draft.browserTabs.filter((t) => t.id !== id);
      removed = draft.browserTabs.length < before;
      // If we closed the active tab, activate the most recent remaining one.
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
    // Focus the newly-active tab's view so Electron always has a visible
    // browser view after the old one is destroyed.
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
   * Tear down every live browser view this service owns. Called during app
   * shutdown so no `WebContentsView` / CDP debugger attachment leaks when the
   * process exits. Persisted tab records are intentionally left intact so they
   * rehydrate on the next launch.
   */
  async disposeViews(): Promise<void> {
    await this.host.destroyAllViews();
  }

  /**
   * Destroy all live browser views belonging to a space. Used when a space is
   * archived: the persisted tab records are removed by `SpaceService`, but the
   * underlying `WebContentsView` / debugger attachments must be torn down here
   * so they are not leaked. Ownership is intentionally NOT checked — archiving a
   * space forcibly reclaims every view inside it.
   */
  async destroyViewsForSpace(spaceId: string): Promise<void> {
    const tabs = this.appState
      .getState()
      .browserTabs.filter((t) => t.spaceId === spaceId);
    for (const tab of tabs) {
      await this.host.destroyView(tab.id);
    }
  }

  /**
   * Claim exclusive automation control of a tab. Returns the session owner id.
   * Throws `TabOwnershipError` if another owner already holds it.
   */
  startUse(id: string, ownerId: string): BrowserTab {
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
  endUse(id: string, ownerId: string, force = false): BrowserTab {
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
  releaseOwner(ownerId: string): void {
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
  async captureScreenshot(
    id: string,
  ): Promise<{ tabId: string; width: number; height: number; path?: string }> {
    const tab = this.requireTab(id);
    // Recreate the live view if it was lost (e.g. after restart) so capture
    // doesn't spuriously fail with "No live view to capture".
    await this.ensureView(tab);
    const capture = await this.host.capture(id);
    if (!capture) {
      throw new Error(`No live view to capture for tab ${id}`);
    }
    let path: string | undefined;
    if (this.artifacts) {
      const info = this.artifacts.write(
        `screenshot-${id}-${Date.now()}`,
        "png",
        capture.data,
      );
      path = info.path;
    }
    return { tabId: id, width: capture.width, height: capture.height, path };
  }

  /**
   * Capture a tab's current frame in memory (no artifact written). Returns the
   * raw PNG buffer, or null if there is no live view. Used by the renderer to
   * freeze the browser behind a transient DOM overlay.
   */
  async captureFrame(id: string): Promise<Buffer | null> {
    const tab = this.requireTab(id);
    await this.ensureView(tab);
    const capture = await this.host.capture(id);
    return capture ? Buffer.from(capture.data) : null;
  }

  // --- Automation & diagnostics (Phase 4) ---

  /**
   * Extract the page's interactable/semantic elements (read-only). Recreates
   * the live view if it was lost so callers don't see spurious failures.
   */
  async getBrowserState(id: string): Promise<BrowserState> {
    const tab = this.requireTab(id);
    await this.ensureView(tab);
    const state = await this.host.getBrowserState(id);
    if (!state) throw new Error(`No live view for tab ${id}`);
    return { tabId: id, ...state };
  }

  /** Click an element by an id from the most recent `getBrowserState`. */
  async clickElement(
    id: string,
    elementId: string,
    control: ControlContext = {},
  ): Promise<void> {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    await this.ensureView(tab);
    await this.host.clickElement(id, elementId);
    this.logger.info("BrowserTabs", `click ${elementId} on tab ${id}`);
  }

  /** Type text into an element by id (replaces its existing value). */
  async typeText(
    id: string,
    elementId: string,
    text: string,
    control: ControlContext = {},
  ): Promise<void> {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    await this.ensureView(tab);
    await this.host.typeText(id, elementId, text);
    this.logger.info("BrowserTabs", `type into ${elementId} on tab ${id}`);
  }

  /** Scroll the page by a delta or to an absolute position. */
  async scrollPage(
    id: string,
    options: ScrollOptions,
    control: ControlContext = {},
  ): Promise<void> {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    await this.ensureView(tab);
    await this.host.scrollPage(id, options);
  }

  /** Dispatch a key (named) or literal characters to the focused element/page. */
  async sendKeys(id: string, keys: string, control: ControlContext = {}): Promise<void> {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    await this.ensureView(tab);
    await this.host.sendKeys(id, keys);
  }

  /** Issue a raw CDP command against a tab (treated as a control operation). */
  async cdpCommand(
    id: string,
    method: string,
    params: Record<string, unknown>,
    control: ControlContext = {},
  ): Promise<{ tabId: string; method: string; result: unknown }> {
    const tab = this.requireTab(id);
    this.assertControl(tab, control);
    await this.ensureView(tab);
    const result = await this.host.sendCdp(id, method, params);
    return { tabId: id, method, result };
  }

  /** Read captured console messages for a tab (read-only). */
  async getConsoleLogs(id: string, limit?: number): Promise<ConsoleLogEntry[]> {
    const tab = this.requireTab(id);
    await this.ensureView(tab);
    return this.host.getConsoleLogs(id, limit);
  }

  /** Read observed network requests for a tab (read-only). */
  async getNetworkLogs(id: string, limit?: number): Promise<NetworkLogEntry[]> {
    const tab = this.requireTab(id);
    await this.ensureView(tab);
    return this.host.getNetworkLogs(id, limit);
  }

  openWorkspaceTab(input: {
    title: string;
    cwd: string;
    kind?: WorkspaceTab["kind"];
    spaceId?: string;
    terminalId?: string;
  }): WorkspaceTab {
    const spaceId = input.spaceId ?? this.activeSpaceId();
    const tab: WorkspaceTab = {
      id: newWorkspaceTabId(),
      spaceId,
      title: input.title,
      cwd: input.cwd,
      kind: input.kind ?? "editor",
      terminalId: input.terminalId,
      active: true,
      createdAt: Date.now(),
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

  /** Persist the live terminal session backing a terminal workspace tab. */
  setWorkspaceTabTerminal(id: string, terminalId: string | null): WorkspaceTab {
    const tab = this.appState.getState().workspaceTabs.find((t) => t.id === id);
    if (!tab) throw new Error(`Unknown workspace tab: ${id}`);
    if (tab.kind !== "terminal") {
      throw new Error(`Workspace tab is not a terminal: ${id}`);
    }
    this.appState.update((draft) => {
      const t = draft.workspaceTabs.find((w) => w.id === id);
      if (!t) return;
      if (terminalId) t.terminalId = terminalId;
      else t.terminalId = undefined;
    }, "set_workspace_tab_terminal");
    const next = this.appState.getState().workspaceTabs.find((t) => t.id === id);
    if (!next) throw new Error(`Unknown workspace tab: ${id}`);
    return next;
  }

  /**
   * Persist the editor session state of an editor workspace tab: the focused
   * file and the list of open files (paths are relative to the tab's cwd). This
   * lets the renderer editor, CLI, and agents agree on what is open via state.
   */
  setWorkspaceTabFile(
    id: string,
    input: { activeFilePath?: string | null; openFilePaths?: string[] },
  ): WorkspaceTab {
    const tab = this.appState.getState().workspaceTabs.find((t) => t.id === id);
    if (!tab) throw new Error(`Unknown workspace tab: ${id}`);
    if (tab.kind !== "editor") {
      throw new Error(`Workspace tab is not an editor: ${id}`);
    }
    this.appState.update((draft) => {
      const t = draft.workspaceTabs.find((w) => w.id === id);
      if (!t) return;
      if (input.activeFilePath !== undefined) {
        t.activeFilePath = input.activeFilePath ?? undefined;
      }
      if (input.openFilePaths !== undefined) {
        t.openFilePaths = input.openFilePaths;
        // Keep the active file consistent with the open set.
        if (t.activeFilePath && !input.openFilePaths.includes(t.activeFilePath)) {
          t.activeFilePath = input.openFilePaths[input.openFilePaths.length - 1];
        }
      }
    }, "set_workspace_tab_file");
    const next = this.appState.getState().workspaceTabs.find((t) => t.id === id);
    if (!next) throw new Error(`Unknown workspace tab: ${id}`);
    return next;
  }

  /** Make a workspace tab the active one within its space. */
  focusWorkspaceTab(id: string): WorkspaceTab {
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
  closeWorkspaceTab(id: string): boolean {
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

  private requireTab(id: string): BrowserTab {
    const tab = this.getTab(id);
    if (!tab) throw new Error(`Unknown browser tab: ${id}`);
    return tab;
  }

  /** Merge a host nav-state update into the persisted tab record. */
  private applyNavState(tabId: string, nav: ViewNavState): void {
    if (!this.getTab(tabId)) return;
    this.appState.update((draft) => {
      const t = draft.browserTabs.find((b) => b.id === tabId);
      if (!t) return;
      if (nav.url !== undefined) t.url = nav.url;
      if (nav.title !== undefined) t.title = nav.title;
      if (nav.faviconUrl !== undefined) t.faviconUrl = nav.faviconUrl;
      if (nav.loadState !== undefined) t.loadState = nav.loadState;
      if (nav.canGoBack !== undefined) t.canGoBack = nav.canGoBack;
      if (nav.canGoForward !== undefined) t.canGoForward = nav.canGoForward;
    }, "browser_nav_state");
  }
}
