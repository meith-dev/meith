import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { type AgentConfig, AgentConfigSchema, defaultAgentConfig } from "@meith/shared";
import { JsonStore } from "../storage/JsonStore.js";

/**
 * Persists user-configurable agent settings (adapter command/model and the
 * auto-accept toggle) at `<userData>/agent/config.json`. Kept separate from the
 * bootstrap-managed `~/.meith/config.json` (which is rewritten every launch) so
 * user choices survive restarts.
 */
export class AgentConfigStore {
  private readonly store: JsonStore<AgentConfig>;

  constructor(dataDir: string) {
    const path = join(dataDir, "agent", "config.json");
    const legacyPath = join(dataDir, "agent", "agent", "config.json");
    if (!existsSync(path) && existsSync(legacyPath)) {
      mkdirSync(join(dataDir, "agent"), { recursive: true });
      copyFileSync(legacyPath, path);
    }
    this.store = new JsonStore<AgentConfig>({
      path,
      parse: (raw) => AgentConfigSchema.parse(raw),
      defaults: () => defaultAgentConfig(),
    });
  }

  get(): AgentConfig {
    return this.store.get();
  }

  /** Merge a partial update, validate, and persist. */
  set(patch: Partial<AgentConfig>): AgentConfig {
    const next = AgentConfigSchema.parse({ ...this.store.get(), ...patch });
    this.store.set(next);
    return next;
  }

  flush(): void {
    this.store.flush();
  }
}
