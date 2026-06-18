import { existsSync, statSync } from "node:fs";
import { JsonlStore } from "../storage/JsonlStore.js";
import { CURRENT_STATE_VERSION } from "../storage/migrations.js";
import type { AppStateService } from "./AppStateService.js";

export type CollectionKind = "json" | "jsonl";

export interface CollectionInfo {
  name: string;
  kind: CollectionKind;
  path: string;
  description: string;
  exists: boolean;
  sizeBytes: number;
}

interface CollectionDef extends Omit<CollectionInfo, "exists" | "sizeBytes"> {
  read: (limit?: number) => unknown;
}

export interface StorageServiceOptions {
  dataDir: string;
  appState: AppStateService;
  logPath: string;
  auditPath: string;
}

/**
 * Catalogs the durable storage collections and exposes read/inspect helpers.
 * Backs the `storage_*` tools so the CLI and future agents can introspect
 * persisted data without reaching into individual services.
 */
export class StorageService {
  private readonly collections: Map<string, CollectionDef> = new Map();

  constructor(private readonly opts: StorageServiceOptions) {
    const logStore = new JsonlStore<unknown>({
      path: opts.logPath,
      parse: (raw) => raw,
    });
    const auditStore = new JsonlStore<unknown>({
      path: opts.auditPath,
      parse: (raw) => raw,
    });

    this.define({
      name: "state",
      kind: "json",
      path: `${opts.dataDir}/state.json`,
      description: "Small, bounded application state (spaces, tabs).",
      read: () => opts.appState.getState(),
    });
    this.define({
      name: "logs",
      kind: "jsonl",
      path: opts.logPath,
      description: "Append-only structured log history.",
      read: (limit) => logStore.tail(limit ?? 200),
    });
    this.define({
      name: "audit",
      kind: "jsonl",
      path: opts.auditPath,
      description: "Append-only redacted tool-call audit history.",
      read: (limit) => auditStore.tail(limit ?? 200),
    });
  }

  private define(def: CollectionDef): void {
    this.collections.set(def.name, def);
  }

  /** The directory all collections live under. */
  get dataDirectory(): string {
    return this.opts.dataDir;
  }

  listCollections(): CollectionInfo[] {
    return [...this.collections.values()].map((def) => {
      let sizeBytes = 0;
      const exists = existsSync(def.path);
      if (exists) {
        try {
          sizeBytes = statSync(def.path).size;
        } catch {
          sizeBytes = 0;
        }
      }
      return {
        name: def.name,
        kind: def.kind,
        path: def.path,
        description: def.description,
        exists,
        sizeBytes,
      };
    });
  }

  readCollection(name: string, limit?: number): unknown {
    const def = this.collections.get(name);
    if (!def) {
      throw new Error(`Unknown collection: ${name}`);
    }
    return def.read(limit);
  }

  /** Full snapshot suitable for backup/debugging. */
  exportState(): Record<string, unknown> {
    return {
      exportedAt: Date.now(),
      dataDirectory: this.opts.dataDir,
      stateVersion: CURRENT_STATE_VERSION,
      collections: this.listCollections(),
      state: this.opts.appState.getState(),
    };
  }
}
