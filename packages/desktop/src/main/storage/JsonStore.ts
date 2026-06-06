import { atomicWriteFileSync, readJsonSafe } from "./atomic.js";

export interface JsonStoreOptions<T> {
  path: string;
  /** Parse/validate raw JSON into T (e.g. a Zod `schema.parse`). */
  parse: (raw: unknown) => T;
  /** Produce a fresh default value when no (valid) file exists. */
  defaults: () => T;
  /** Debounce window for disk writes, in ms. 0 = synchronous writes. */
  debounceMs?: number;
  /** Called when an existing file was corrupt and got reset. */
  onCorruption?: (backupPath: string | undefined) => void;
}

/**
 * A small, single-value JSON store with debounced atomic persistence. Used for
 * low-frequency, bounded state (app preferences, tab/space collections). High
 * frequency append-only data belongs in `JsonlStore` instead so we never
 * rewrite a large file on every event.
 */
export class JsonStore<T> {
  private value: T;
  private timer: NodeJS.Timeout | null = null;
  private dirty = false;
  private readonly debounceMs: number;

  constructor(private readonly opts: JsonStoreOptions<T>) {
    this.debounceMs = opts.debounceMs ?? 150;
    const { value, corrupt, backupPath } = readJsonSafe(opts.path, opts.parse);
    if (value !== null) {
      this.value = value;
    } else {
      this.value = opts.defaults();
      if (corrupt) opts.onCorruption?.(backupPath);
    }
  }

  get(): T {
    return this.value;
  }

  /** Replace the value and schedule a persist. */
  set(value: T): void {
    this.value = value;
    this.schedule();
  }

  private schedule(): void {
    this.dirty = true;
    if (this.debounceMs <= 0) {
      this.flush();
      return;
    }
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
    // Don't keep the event loop alive solely for a pending flush.
    this.timer.unref?.();
  }

  /** Force any pending write to disk immediately (e.g. on shutdown). */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    atomicWriteFileSync(this.opts.path, JSON.stringify(this.value, null, 2));
    this.dirty = false;
  }
}
