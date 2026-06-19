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

export interface LogContext {
  correlationId?: string;
  requestId?: string;
  caller?: LogEntry["caller"];
  sessionId?: string;
  toolName?: string;
  spaceId?: string;
  tabId?: string;
}

export interface LogListFilter {
  limit?: number;
  level?: LogEntry["level"];
  source?: string;
  caller?: LogEntry["caller"];
  sessionId?: string;
  toolName?: string;
  search?: string;
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

  log(
    level: LogEntry["level"],
    source: string,
    message: string,
    context: LogContext = {},
  ): LogEntry {
    const entry: LogEntry = {
      id: createId("log"),
      ts: Date.now(),
      level,
      source,
      message,
      ...definedContext(context),
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

  debug = (source: string, message: string, context?: LogContext) =>
    this.log("debug", source, message, context);
  info = (source: string, message: string, context?: LogContext) =>
    this.log("info", source, message, context);
  warn = (source: string, message: string, context?: LogContext) =>
    this.log("warn", source, message, context);
  error = (source: string, message: string, context?: LogContext) =>
    this.log("error", source, message, context);

  list(filter?: number | LogListFilter): LogEntry[] {
    const opts: LogListFilter =
      typeof filter === "number" ? { limit: filter } : (filter ?? {});
    let entries = this.entries;
    if (opts.level) entries = entries.filter((e) => e.level === opts.level);
    if (opts.source) entries = entries.filter((e) => e.source === opts.source);
    if (opts.caller) entries = entries.filter((e) => e.caller === opts.caller);
    if (opts.sessionId) entries = entries.filter((e) => e.sessionId === opts.sessionId);
    if (opts.toolName) entries = entries.filter((e) => e.toolName === opts.toolName);
    if (opts.search) {
      const q = opts.search.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.message.toLowerCase().includes(q) ||
          e.source.toLowerCase().includes(q) ||
          e.toolName?.toLowerCase().includes(q) ||
          e.sessionId?.toLowerCase().includes(q) ||
          e.requestId?.toLowerCase().includes(q) ||
          e.correlationId?.toLowerCase().includes(q),
      );
    }
    return opts.limit ? entries.slice(-opts.limit) : [...entries];
  }
}

function definedContext(context: LogContext): Partial<LogEntry> {
  const out: Partial<LogEntry> = {};
  for (const [key, value] of Object.entries(context) as [
    keyof LogContext,
    string | undefined,
  ][]) {
    if (value !== undefined) out[key] = value as never;
  }
  return out;
}
