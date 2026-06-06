import { existsSync, readFileSync } from "node:fs";
import { appendLineSync, atomicWriteFileSync } from "./atomic.js";

export interface JsonlStoreOptions<T> {
  path: string;
  /** Validate a single parsed record; return null to drop a bad line. */
  parse: (raw: unknown) => T | null;
  /**
   * Maximum retained records. When `append` pushes past `maxRecords *
   * compactFactor`, the file is compacted back down to the most recent
   * `maxRecords`. Set to 0 to disable compaction.
   */
  maxRecords?: number;
  /** How far past `maxRecords` to grow before compacting (default 1.5x). */
  compactFactor?: number;
}

/**
 * Append-only newline-delimited JSON store for high-frequency collections
 * (logs, agent messages, process output). Appends are O(1) single-line writes,
 * so we never rewrite a large file per event. The file is periodically
 * compacted to keep it bounded.
 */
export class JsonlStore<T> {
  private count = 0;
  private readonly maxRecords: number;
  private readonly compactFactor: number;

  constructor(private readonly opts: JsonlStoreOptions<T>) {
    this.maxRecords = opts.maxRecords ?? 5000;
    this.compactFactor = opts.compactFactor ?? 1.5;
    this.count = this.readAll().length;
  }

  /** Append one record and compact if the file has grown past the threshold. */
  append(record: T): void {
    appendLineSync(this.opts.path, JSON.stringify(record));
    this.count += 1;
    if (
      this.maxRecords > 0 &&
      this.count > Math.ceil(this.maxRecords * this.compactFactor)
    ) {
      this.compact();
    }
  }

  /** Read all valid records, skipping any malformed lines. */
  readAll(): T[] {
    if (!existsSync(this.opts.path)) return [];
    const text = readFileSync(this.opts.path, "utf8");
    const out: T[] = [];
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = this.opts.parse(JSON.parse(trimmed));
        if (parsed !== null) out.push(parsed);
      } catch {
        // Skip corrupt line; append-only logs tolerate occasional bad frames.
      }
    }
    return out;
  }

  /** Read the most recent `limit` records (all if omitted). */
  tail(limit?: number): T[] {
    const all = this.readAll();
    if (!limit || limit >= all.length) return all;
    return all.slice(-limit);
  }

  /** Rewrite the file atomically, keeping only the most recent `maxRecords`. */
  compact(): void {
    const kept = this.tail(this.maxRecords || undefined);
    const body = kept.map((r) => JSON.stringify(r)).join("\n");
    atomicWriteFileSync(this.opts.path, body.length ? `${body}\n` : "");
    this.count = kept.length;
  }
}
