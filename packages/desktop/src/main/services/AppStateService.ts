import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  AppStateSchema,
  defaultAppState,
  newSpaceId,
  type AppState,
} from "@meith/shared";
import type { Logger } from "./Logger.js";

/**
 * Owns the persistent application state. The main process is the single
 * authority: renderer, CLI, agents and plugins all read/mutate through here.
 *
 * State is persisted as JSON at `statePath` and re-validated on load. Any
 * mutation emits `"change"` with the new state so subscribers (renderer, IPC
 * push, future agents) can react.
 */
export class AppStateService extends EventEmitter {
  private state: AppState;

  constructor(
    private readonly statePath: string,
    private readonly logger: Logger,
  ) {
    super();
    this.state = this.load();
    this.ensureDefaultSpace();
  }

  private load(): AppState {
    try {
      if (existsSync(this.statePath)) {
        const raw = JSON.parse(readFileSync(this.statePath, "utf8"));
        return AppStateSchema.parse(raw);
      }
    } catch (err) {
      this.logger.warn("AppState", `Failed to load state, resetting: ${String(err)}`);
    }
    return defaultAppState();
  }

  private persist(): void {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), "utf8");
  }

  private ensureDefaultSpace(): void {
    if (this.state.spaces.length === 0) {
      const id = newSpaceId();
      this.state.spaces.push({
        id,
        name: "Default",
        color: "#6366f1",
        createdAt: Date.now(),
      });
      this.state.activeSpaceId = id;
      this.commit("init default space");
    } else if (!this.state.activeSpaceId) {
      this.state.activeSpaceId = this.state.spaces[0].id;
      this.commit("set active space");
    }
  }

  /** Read a deep copy so callers can't mutate internal state directly. */
  getState(): AppState {
    return structuredClone(this.state);
  }

  /**
   * Apply a mutation function, persist, validate, and broadcast the change.
   * All writes funnel through here to keep persistence + events consistent.
   */
  update(mutate: (draft: AppState) => void, reason = "update"): AppState {
    const draft = structuredClone(this.state);
    mutate(draft);
    this.state = AppStateSchema.parse(draft);
    this.commit(reason);
    return this.getState();
  }

  private commit(reason: string): void {
    this.persist();
    this.logger.debug("AppState", `state changed (${reason})`);
    this.emit("change", this.getState());
  }
}
