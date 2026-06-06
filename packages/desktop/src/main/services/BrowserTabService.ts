import {
  newBrowserTabId,
  newWorkspaceTabId,
  type BrowserTab,
  type WorkspaceTab,
} from "@meith/shared";
import type { AppStateService } from "./AppStateService.js";
import type { Logger } from "./Logger.js";

/**
 * Operations over the browser/workspace tab model.
 *
 * Today these tabs are pure data rendered by the UI. The method surface is
 * intentionally shaped so it can later be backed by real Electron
 * `WebContentsView` instances: e.g. `openBrowserTab` would also create a view,
 * `closeBrowserTab` would destroy it, etc. Callers (tools/IPC) won't change.
 */
export class BrowserTabService {
  constructor(
    private readonly appState: AppStateService,
    private readonly logger: Logger,
  ) {}

  private activeSpaceId(): string {
    const state = this.appState.getState();
    return state.activeSpaceId ?? state.spaces[0]?.id ?? "default";
  }

  listBrowserTabs(spaceId?: string): BrowserTab[] {
    const tabs = this.appState.getState().browserTabs;
    return spaceId ? tabs.filter((t) => t.spaceId === spaceId) : tabs;
  }

  listWorkspaceTabs(spaceId?: string): WorkspaceTab[] {
    const tabs = this.appState.getState().workspaceTabs;
    return spaceId ? tabs.filter((t) => t.spaceId === spaceId) : tabs;
  }

  openBrowserTab(input: {
    url: string;
    title?: string;
    spaceId?: string;
    cwd?: string;
  }): BrowserTab {
    const spaceId = input.spaceId ?? this.activeSpaceId();
    const tab: BrowserTab = {
      id: newBrowserTabId(),
      spaceId,
      url: input.url,
      title: input.title ?? input.url,
      cwd: input.cwd,
      active: true,
      createdAt: Date.now(),
    };
    this.appState.update((draft) => {
      for (const t of draft.browserTabs) {
        if (t.spaceId === spaceId) t.active = false;
      }
      draft.browserTabs.push(tab);
      // TODO(webview): create a WebContentsView for `tab.id` and load url here.
    }, "open_browser_tab");
    this.logger.info("BrowserTabs", `opened browser tab ${tab.id} -> ${tab.url}`);
    return tab;
  }

  closeBrowserTab(id: string): boolean {
    let removed = false;
    this.appState.update((draft) => {
      const before = draft.browserTabs.length;
      draft.browserTabs = draft.browserTabs.filter((t) => t.id !== id);
      removed = draft.browserTabs.length < before;
      // TODO(webview): destroy the WebContentsView bound to `id`.
    }, "close_browser_tab");
    return removed;
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
}
