import { type Space, newSpaceId } from "@meith/shared";
import type { AppStateService } from "./AppStateService.js";
import type { BrowserTabService } from "./BrowserTabService.js";
import type { DevServerService } from "./DevServerService.js";
import type { Logger } from "./Logger.js";
import type { TerminalService } from "./TerminalService.js";

/**
 * Owns the space (workspace grouping) model. Spaces group browser/workspace
 * tabs; exactly one space is active at a time. Each space is 1:1 with a project
 * (see `ProjectService`) — `projectId` links them. Like `BrowserTabService`,
 * all mutations funnel through `AppStateService` so persistence and change
 * events stay consistent across renderer, CLI, and agents.
 *
 * `SpaceService` deliberately does NOT depend on `ProjectService` (that
 * dependency runs the other way). When a space closes it drops the linked
 * project *record* from state directly and stops that project's dev servers via
 * the optional `DevServerService`, keeping the teardown cohesive without a
 * service cycle.
 */
export class SpaceService {
  constructor(
    private readonly appState: AppStateService,
    private readonly browserTabs: BrowserTabService,
    private readonly logger: Logger,
    private readonly devServers?: DevServerService,
    private readonly terminals?: TerminalService,
  ) {}

  list(): Space[] {
    return this.appState.getState().spaces;
  }

  get(id: string): Space | undefined {
    return this.appState.getState().spaces.find((s) => s.id === id);
  }

  getByProjectId(projectId: string): Space | undefined {
    return this.appState.getState().spaces.find((s) => s.projectId === projectId);
  }

  getActiveSpaceId(): string | null {
    return this.appState.getState().activeSpaceId;
  }

  /** Create a space and make it active. Optionally bound to a project. */
  create(input: { name: string; color?: string; projectId?: string | null }): Space {
    const space: Space = {
      id: newSpaceId(),
      name: input.name.trim() || "Untitled",
      color: input.color,
      projectId: input.projectId ?? null,
      createdAt: Date.now(),
    };
    this.appState.update((draft) => {
      draft.spaces.push(space);
      draft.activeSpaceId = space.id;
    }, "create_space");
    this.logger.info("Spaces", `created space ${space.id} (${space.name})`);
    return space;
  }

  /** Rename and/or recolor an existing space. */
  update(id: string, patch: { name?: string; color?: string }): Space {
    const exists = this.appState.getState().spaces.some((s) => s.id === id);
    if (!exists) throw new Error(`Unknown space: ${id}`);
    this.appState.update((draft) => {
      const space = draft.spaces.find((s) => s.id === id);
      if (!space) return;
      if (patch.name !== undefined) space.name = patch.name.trim() || space.name;
      if (patch.color !== undefined) space.color = patch.color;
    }, "update_space");
    const next = this.appState.getState().spaces.find((s) => s.id === id);
    if (!next) throw new Error(`Unknown space: ${id}`);
    return next;
  }

  /** Link a space to its project (1:1). Used by `ProjectService.open`. */
  bindProject(spaceId: string, projectId: string): Space {
    const exists = this.appState.getState().spaces.some((s) => s.id === spaceId);
    if (!exists) throw new Error(`Unknown space: ${spaceId}`);
    this.appState.update((draft) => {
      const space = draft.spaces.find((s) => s.id === spaceId);
      if (space) space.projectId = projectId;
    }, "bind_project");
    const next = this.appState.getState().spaces.find((s) => s.id === spaceId);
    if (!next) throw new Error(`Unknown space: ${spaceId}`);
    return next;
  }

  /** Switch the active space. */
  switchTo(id: string): Space {
    const space = this.appState.getState().spaces.find((s) => s.id === id);
    if (!space) throw new Error(`Unknown space: ${id}`);
    this.appState.update((draft) => {
      draft.activeSpaceId = id;
    }, "switch_space");
    void this.browserTabs.focusActiveBrowserTab(id).catch((error: unknown) => {
      this.logger.warn(
        "Spaces",
        `failed to focus active browser tab for space ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    this.logger.info("Spaces", `switched to space ${id}`);
    return space;
  }

  /**
   * Close (archive) a space and all of its tabs, plus the project it hosts. The
   * last space cannot be closed so there is always a valid active space. If the
   * active space is closed, the most recent remaining space becomes active.
   *
   * Live dev servers belonging to the hosted project are stopped first (by
   * cwd), then the browser views are torn down, then the records are dropped.
   */
  async close(id: string): Promise<boolean> {
    const state = this.appState.getState();
    if (state.spaces.length <= 1) {
      throw new Error("Cannot close the last remaining space");
    }
    const space = state.spaces.find((s) => s.id === id);
    if (!space) return false;

    // Stop any dev servers owned by the hosted project before dropping records.
    if (this.devServers && space.projectId) {
      const project = state.projects.find((p) => p.id === space.projectId);
      if (project) {
        for (const server of this.devServers.findByCwd(project.cwd)) {
          this.devServers.stop(server.id);
        }
      }
    }

    if (this.terminals) {
      for (const tab of state.workspaceTabs) {
        if (tab.spaceId === id && tab.kind === "terminal" && tab.terminalId) {
          this.terminals.close(tab.terminalId);
        }
      }
    }

    // Tear down live browser views BEFORE dropping their records, otherwise the
    // backing WebContentsView / debugger attachments would be orphaned.
    await this.browserTabs.destroyViewsForSpace(id);
    this.appState.update((draft) => {
      draft.spaces = draft.spaces.filter((s) => s.id !== id);
      draft.browserTabs = draft.browserTabs.filter((t) => t.spaceId !== id);
      draft.workspaceTabs = draft.workspaceTabs.filter((t) => t.spaceId !== id);
      // Drop the project record this space hosted (its files remain on disk).
      if (space.projectId) {
        draft.projects = draft.projects.filter((p) => p.id !== space.projectId);
      }
      if (draft.activeSpaceId === id) {
        draft.activeSpaceId = draft.spaces[draft.spaces.length - 1]?.id ?? null;
      }
    }, "close_space");
    const activeSpaceId = this.appState.getState().activeSpaceId;
    if (activeSpaceId) {
      void this.browserTabs
        .focusActiveBrowserTab(activeSpaceId)
        .catch((error: unknown) => {
          this.logger.warn(
            "Spaces",
            `failed to focus active browser tab for space ${activeSpaceId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }
    this.logger.info("Spaces", `closed space ${id}`);
    return true;
  }
}
