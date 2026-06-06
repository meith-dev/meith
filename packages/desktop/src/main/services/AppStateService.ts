import { EventEmitter } from "node:events";
import {
  type AppState,
  AppStateSchema,
  defaultAppState,
  newSpaceId,
} from "@meith/shared";
import { JsonStore } from "../storage/JsonStore.js";
import { migrateAppState } from "../storage/migrations.js";
import type { Logger } from "./Logger.js";

/**
 * Owns the persistent application state. The main process is the single
 * authority: renderer, CLI, agents and plugins all read/mutate through here.
 *
 * Persistence is delegated to a debounced, atomic `JsonStore`. On load, raw
 * JSON is run through the migration system and validated; corrupt files are
 * backed up and the state resets to defaults. Any mutation emits `"change"`
 * with the new state so subscribers (renderer, IPC push, agents) can react.
 */
export class AppStateService extends EventEmitter {
  private readonly store: JsonStore<AppState>;

  constructor(
    statePath: string,
    private readonly logger: Logger,
    debounceMs = 150,
  ) {
    super();
    this.store = new JsonStore<AppState>({
      path: statePath,
      parse: migrateAppState,
      defaults: defaultAppState,
      debounceMs,
      onCorruption: (backupPath) => {
        this.logger.warn(
          "AppState",
          `state file was corrupt; reset to defaults${
            backupPath ? ` (backed up to ${backupPath})` : ""
          }`,
        );
      },
    });
    this.ensureDefaultSpace();
  }

  private ensureDefaultSpace(): void {
    const state = this.store.get();
    if (state.spaces.length === 0) {
      const id = newSpaceId();
      this.update((draft) => {
        draft.spaces.push({
          id,
          name: "Default",
          color: "#6366f1",
          createdAt: Date.now(),
        });
        draft.activeSpaceId = id;
      }, "init default space");
    } else if (!state.activeSpaceId) {
      this.update((draft) => {
        draft.activeSpaceId = draft.spaces[0].id;
      }, "set active space");
    }
  }

  /** Read a deep copy so callers can't mutate internal state directly. */
  getState(): AppState {
    return structuredClone(this.store.get());
  }

  /**
   * Apply a mutation function, persist, validate, and broadcast the change.
   * All writes funnel through here to keep persistence + events consistent.
   */
  update(mutate: (draft: AppState) => void, reason = "update"): AppState {
    const draft = structuredClone(this.store.get());
    mutate(draft);
    const next = AppStateSchema.parse(draft);
    this.store.set(next);
    this.logger.debug("AppState", `state changed (${reason})`);
    const snapshot = structuredClone(next);
    this.emit("change", snapshot);
    return snapshot;
  }

  /** Force any pending debounced write to disk (call on shutdown). */
  flush(): void {
    this.store.flush();
  }
}
