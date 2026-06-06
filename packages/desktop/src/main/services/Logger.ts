import { EventEmitter } from "node:events";
import { createId, type LogEntry } from "@aide/shared";

/**
 * In-memory ring buffer of structured logs. Backs the `app_get_logs` tool and
 * the renderer log panel. Real implementations could also tee to disk.
 */
export class Logger extends EventEmitter {
  private entries: LogEntry[] = [];
  private readonly max: number;

  constructor(max = 1000) {
    super();
    this.max = max;
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
