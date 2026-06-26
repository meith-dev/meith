import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";
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
    const out: T[] = [];
    for (const line of this.readLines()) {
      const parsed = this.parseLine(line);
      if (parsed !== null) out.push(parsed);
    }
    this.count = out.length;
    return out;
  }

  /** Read the most recent `limit` records (all if omitted). */
  tail(limit?: number): T[] {
    const all = this.readAll();
    if (!limit || limit >= all.length) return all;
    return all.slice(-limit);
  }

  /**
   * Read a bounded tail of the file. This is intentionally approximate: when
   * the file is larger than `maxBytes`, the first returned line may be omitted
   * because the read starts in the middle of a JSONL frame.
   */
  readRecent(maxBytes: number, maxRecords: number): T[] {
    if (!existsSync(this.opts.path) || maxBytes <= 0 || maxRecords <= 0) return [];
    const size = this.sizeBytes();
    if (size <= maxBytes) return this.tail(maxRecords);

    const fd = openSync(this.opts.path, "r");
    try {
      const start = Math.max(0, size - maxBytes);
      const length = size - start;
      const buffer = Buffer.allocUnsafe(length);
      readSync(fd, buffer, 0, length, start);
      let text = buffer.toString("utf8");
      if (start > 0) {
        const firstNewline = text.indexOf("\n");
        text = firstNewline >= 0 ? text.slice(firstNewline + 1) : "";
      }
      const records: T[] = [];
      for (const line of text.split("\n")) {
        const parsed = this.parseLine(line);
        if (parsed !== null) records.push(parsed);
      }
      return records.length > maxRecords ? records.slice(-maxRecords) : records;
    } finally {
      closeSync(fd);
    }
  }

  /** Rewrite the file atomically, keeping only the most recent `maxRecords`. */
  compact(): void {
    const kept = this.tail(this.maxRecords || undefined);
    this.replaceAll(kept);
  }

  /** Rewrite the file atomically with the provided records. */
  replaceAll(records: T[]): void {
    const body = records.map((r) => JSON.stringify(r)).join("\n");
    atomicWriteFileSync(this.opts.path, body.length ? `${body}\n` : "");
    this.count = records.length;
  }

  /** Current on-disk file size, or 0 when the file is missing. */
  sizeBytes(): number {
    try {
      return statSync(this.opts.path).size;
    } catch {
      return 0;
    }
  }

  private parseLine(line: string): T | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      return this.opts.parse(JSON.parse(trimmed));
    } catch {
      // Skip corrupt line; append-only logs tolerate occasional bad frames.
      return null;
    }
  }

  private *readLines(): Iterable<string> {
    const fd = openSync(this.opts.path, "r");
    const decoder = new StringDecoder("utf8");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let pending = "";
    try {
      while (true) {
        const bytesRead = readSync(fd, buffer, 0, buffer.length, null);
        if (bytesRead === 0) break;
        pending += decoder.write(buffer.subarray(0, bytesRead));
        let newline = pending.indexOf("\n");
        while (newline !== -1) {
          yield pending.slice(0, newline);
          pending = pending.slice(newline + 1);
          newline = pending.indexOf("\n");
        }
      }
      pending += decoder.end();
      if (pending) yield pending;
    } finally {
      closeSync(fd);
    }
  }
}
