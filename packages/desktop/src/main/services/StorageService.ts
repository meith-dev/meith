import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { JsonlStore } from "../storage/JsonlStore.js";
import { CURRENT_STATE_VERSION } from "../storage/migrations.js";
import type { AppStateService } from "./AppStateService.js";

export type CollectionKind = "json" | "jsonl" | "directory";

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

export interface StorageMaintenanceResult {
  collection?: string;
  deletedFiles: number;
  deletedBytes: number;
}

interface FileInfo {
  path: string;
  sizeBytes: number;
  createdAt: number;
  modifiedAt: number;
}

export interface SupportBundle {
  schema: "meith-support-bundle/v1";
  exportedAt: number;
  dataDirectory: string;
  stateVersion: number;
  collections: CollectionInfo[];
  state: unknown;
  recentLogs: unknown;
  recentAudit: unknown;
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
    this.define({
      name: "artifacts",
      kind: "directory",
      path: this.artifactsDirectory,
      description: "Binary and JSON artifacts, including screenshots and bug reports.",
      read: (limit) => this.listFiles(this.artifactsDirectory).slice(0, limit ?? 500),
    });
    this.define({
      name: "agent_sessions",
      kind: "json",
      path: this.agentSessionsPath,
      description:
        "Agent session metadata index; transcripts are stored as per-session JSONL.",
      read: () => this.readCollectionFile(this.agentSessionsPath),
    });
    this.define({
      name: "agent_transcripts",
      kind: "directory",
      path: this.agentTranscriptsDirectory,
      description: "Append-only JSONL agent transcripts, one file per session.",
      read: (limit) =>
        this.listFiles(this.agentTranscriptsDirectory).slice(0, limit ?? 500),
    });
  }

  private define(def: CollectionDef): void {
    this.collections.set(def.name, def);
  }

  /** The directory all collections live under. */
  get dataDirectory(): string {
    return this.opts.dataDir;
  }

  get artifactsDirectory(): string {
    return join(this.opts.dataDir, "artifacts");
  }

  get agentSessionsPath(): string {
    return join(this.opts.dataDir, "agent", "sessions.json");
  }

  get agentTranscriptsDirectory(): string {
    return join(this.opts.dataDir, "agent", "sessions");
  }

  listCollections(): CollectionInfo[] {
    return [...this.collections.values()].map((def) => {
      const exists = existsSync(def.path);
      const sizeBytes = exists ? this.pathSize(def.path) : 0;
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

  exportSupportBundle(logsLimit = 500): SupportBundle {
    return {
      schema: "meith-support-bundle/v1",
      exportedAt: Date.now(),
      dataDirectory: this.opts.dataDir,
      stateVersion: CURRENT_STATE_VERSION,
      collections: this.listCollections(),
      state: this.opts.appState.getState(),
      recentLogs: this.readCollection("logs", logsLimit),
      recentAudit: this.readCollection("audit", logsLimit),
    };
  }

  clearCollection(name: string): StorageMaintenanceResult {
    const allowed = new Set(["logs", "audit", "artifacts"]);
    if (!allowed.has(name)) {
      throw new Error(`Collection cannot be cleared from storage management: ${name}`);
    }
    const def = this.collections.get(name);
    if (!def) throw new Error(`Unknown collection: ${name}`);
    const before = this.pathSize(def.path);
    const deletedFiles = this.pathExists(def.path)
      ? statSync(def.path).isDirectory()
        ? this.listFiles(def.path).length
        : 1
      : 0;
    rmSync(def.path, { recursive: true, force: true });
    return { collection: name, deletedFiles, deletedBytes: before };
  }

  deleteOldScreenshots(olderThanDays: number): StorageMaintenanceResult {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let deletedFiles = 0;
    let deletedBytes = 0;
    for (const file of this.listFiles(this.artifactsDirectory)) {
      const name = basename(file.path);
      const isScreenshot =
        extname(name).toLowerCase() === ".png" &&
        (name.startsWith("screenshot-") || name.startsWith("app-"));
      if (!isScreenshot || file.modifiedAt >= cutoff) continue;
      rmSync(file.path, { force: true });
      deletedFiles += 1;
      deletedBytes += file.sizeBytes;
    }
    return { collection: "artifacts", deletedFiles, deletedBytes };
  }

  private readCollectionFile(path: string): unknown {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      return null;
    }
  }

  private pathExists(path: string): boolean {
    try {
      statSync(path);
      return true;
    } catch {
      return false;
    }
  }

  private pathSize(path: string): number {
    try {
      const st = statSync(path);
      if (!st.isDirectory()) return st.size;
      return this.listFiles(path).reduce((sum, file) => sum + file.sizeBytes, 0);
    } catch {
      return 0;
    }
  }

  private listFiles(dir: string): FileInfo[] {
    if (!existsSync(dir)) return [];
    const out: FileInfo[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          out.push(...this.listFiles(path));
          continue;
        }
        if (!entry.isFile()) continue;
        const st = statSync(path);
        out.push({
          path,
          sizeBytes: st.size,
          createdAt: st.birthtimeMs || st.mtimeMs,
          modifiedAt: st.mtimeMs,
        });
      } catch {
        // Ignore files that disappear while storage accounting is running.
      }
    }
    return out.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }
}
