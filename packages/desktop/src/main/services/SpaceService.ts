import { type Space, newSpaceId } from "@meith/shared";
import type { AppStateService } from "./AppStateService.js";
import type { BrowserTabService } from "./BrowserTabService.js";
import type { Logger } from "./Logger.js";

/**
 * Owns the space (workspace grouping) model. Spaces group browser/workspace
 * tabs; exactly one space is active at a time. Like `BrowserTabService`, all
 * mutations funnel through `AppStateService` so persistence and change events
 * stay consistent across renderer, CLI, and agents.
 */
export class SpaceService {
  constructor(
    private readonly appState: AppStateService,
    private readonly browserTabs: BrowserTabService,
    private readonly logger: Logger,
  ) {}

  list(): Space[] {
    return this.appState.getState().spaces;
  }

  getActiveSpaceId(): string | null {
    return this.appState.getState().activeSpaceId;
  }

  /** Create a space and make it active. */
  create(input: { name: string; color?: string }): Space {
    const space: Space = {
      id: newSpaceId(),
      name: input.name.trim() || "Untitled",
      color: input.color,
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

  /** Switch the active space. */
  switchTo(id: string): Space {
    const space = this.appState.getState().spaces.find((s) => s.id === id);
    if (!space) throw new Error(`Unknown space: ${id}`);
    this.appState.update((draft) => {
      draft.activeSpaceId = id;
    }, "switch_space");
    this.logger.info("Spaces", `switched to space ${id}`);
    return space;
  }

  /**
   * Close (archive) a space and all of its tabs. The last space cannot be
   * closed so there is always a valid active space. If the active space is
   * closed, the most recent remaining space becomes active.
   */
  async close(id: string): Promise<boolean> {
    const state = this.appState.getState();
    if (state.spaces.length <= 1) {
      throw new Error("Cannot close the last remaining space");
    }
    if (!state.spaces.some((s) => s.id === id)) return false;
    // Tear down live browser views BEFORE dropping their records, otherwise the
    // backing WebContentsView / debugger attachments would be orphaned.
    await this.browserTabs.destroyViewsForSpace(id);
    this.appState.update((draft) => {
      draft.spaces = draft.spaces.filter((s) => s.id !== id);
      draft.browserTabs = draft.browserTabs.filter((t) => t.spaceId !== id);
      draft.workspaceTabs = draft.workspaceTabs.filter((t) => t.spaceId !== id);
      if (draft.activeSpaceId === id) {
        draft.activeSpaceId = draft.spaces[draft.spaces.length - 1]?.id ?? null;
      }
    }, "close_space");
    this.logger.info("Spaces", `closed space ${id}`);
    return true;
  }
}
