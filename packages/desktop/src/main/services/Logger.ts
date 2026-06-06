import { EventEmitter } from "node:events";
import { type LogEntry, LogEntrySchema, createId } from "@meith/shared";
import { JsonlStore } from "../storage/JsonlStore.js";

export interface LoggerOptions {
  /** Max entries kept in the in-memory ring buffer for fast reads. */
  max?: number;
  /** When set, entries are also appended to this JSONL file and survive restart. */
  logPath?: string;
  /** Max records retained on disk before compaction (JSONL). */
  maxRecords?: number;
}

/**
 * Structured logger backed by an in-memory ring buffer for fast reads, plus an
 * optional append-only JSONL file for durability. Appends are single-line
 * writes (never a full-file rewrite), and the file is compacted automatically.
 */
export class Logger extends EventEmitter {
  private entries: LogEntry[] = [];
  private readonly max: number;
  private readonly store?: JsonlStore<LogEntry>;

  constructor(options: LoggerOptions = {}) {
    super();
    this.max = options.max ?? 1000;
    if (options.logPath) {
      this.store = new JsonlStore<LogEntry>({
        path: options.logPath,
        parse: (raw) => {
          const parsed = LogEntrySchema.safeParse(raw);
          return parsed.success ? parsed.data : null;
        },
        maxRecords: options.maxRecords ?? 5000,
      });
      // Hydrate recent history so logs survive a restart.
      this.entries = this.store.tail(this.max);
    }
  }

  log(level: LogEntry["level"], source: string, message: string): LogEntry {
    const entry: LogEntry = {
      id: createId("log"),
      ts: Date.now(),
      level,
      source,
      message,
    };
    this.entries.push(entry);
    if (this.entries.length > this.max) this.entries.shift();
    this.store?.append(entry);
    // Mirror to stdout so it shows up in terminals / dev tools too.
    const line = `[${source}] ${message}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
    this.emit("entry", entry);
    return entry;
  }

  debug = (source: string, message: string) => this.log("debug", source, message);
  info = (source: string, message: string) => this.log("info", source, message);
  warn = (source: string, message: string) => this.log("warn", source, message);
  error = (source: string, message: string) => this.log("error", source, message);

  list(limit?: number): LogEntry[] {
    if (!limit) return [...this.entries];
    return this.entries.slice(-limit);
  }
}
