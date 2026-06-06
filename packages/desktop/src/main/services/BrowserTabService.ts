import {
  type BrowserTab,
  type WorkspaceTab,
  newBrowserTabId,
  newWorkspaceTabId,
} from "@meith/shared";
import type { BrowserViewHost, ViewNavState } from "../browser/BrowserViewHost.js";
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

  /** Throw unless `ownerId` is allowed to control `tab` (matches or unowned). */
  private assertOwner(tab: BrowserTab, ownerId?: string): void {
    if (tab.ownerId && tab.ownerId !== ownerId) {
      throw new TabOwnershipError(tab.id, tab.ownerId);
    }
  }

  listBrowserTabs(spaceId?: string): BrowserTab[] {
    const tabs = this.appState.getState().browserTabs;
    return spaceId ? tabs.filter((t) => t.spaceId === spaceId) : tabs;
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
  }): Promise<BrowserTab> {
    const spaceId = input.spaceId ?? this.activeSpaceId();
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

  async navigate(id: string, url: string, ownerId?: string): Promise<BrowserTab> {
    const tab = this.requireTab(id);
    this.assertOwner(tab, ownerId);
    this.appState.update((draft) => {
      const t = draft.browserTabs.find((b) => b.id === id);
      if (t) {
        t.url = url;
        t.loadState = "loading";
      }
    }, "navigate");
    await this.host.loadURL(id, url);
    this.logger.info("BrowserTabs", `navigate ${id} -> ${url}`);
    return this.requireTab(id);
  }

  async goBack(id: string, ownerId?: string): Promise<BrowserTab> {
    const tab = this.requireTab(id);
    this.assertOwner(tab, ownerId);
    await this.host.goBack(id);
    return this.requireTab(id);
  }

  async goForward(id: string, ownerId?: string): Promise<BrowserTab> {
    const tab = this.requireTab(id);
    this.assertOwner(tab, ownerId);
    await this.host.goForward(id);
    return this.requireTab(id);
  }

  async refresh(id: string, ownerId?: string): Promise<BrowserTab> {
    const tab = this.requireTab(id);
    this.assertOwner(tab, ownerId);
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
    await this.host.focusView(id);
    return this.requireTab(id);
  }

  async closeBrowserTab(id: string, ownerId?: string): Promise<boolean> {
    const tab = this.getTab(id);
    if (!tab) return false;
    this.assertOwner(tab, ownerId);
    let removed = false;
    this.appState.update((draft) => {
      const before = draft.browserTabs.length;
      draft.browserTabs = draft.browserTabs.filter((t) => t.id !== id);
      removed = draft.browserTabs.length < before;
      // If we closed the active tab, activate the most recent remaining one.
      if (removed && tab.active) {
        const sameSpace = draft.browserTabs.filter((t) => t.spaceId === tab.spaceId);
        const last = sameSpace[sameSpace.length - 1];
        if (last) last.active = true;
      }
    }, "close_browser_tab");
    await this.host.destroyView(id);
    if (removed) this.logger.info("BrowserTabs", `closed browser tab ${id}`);
    return removed;
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
    this.requireTab(id);
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

  openWorkspaceTab(input: {
    title: string;
    cwd: string;
    kind?: WorkspaceTab["kind"];
    spaceId?: string;
  }): WorkspaceTab {
    const spaceId = input.spaceId ?? this.activeSpaceId();
    const tab: WorkspaceTab = {
      id: newWorkspaceTabId(),
      spaceId,
      title: input.title,
      cwd: input.cwd,
      kind: input.kind ?? "editor",
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
