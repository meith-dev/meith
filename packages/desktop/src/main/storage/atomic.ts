import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

/**
 * Durable, atomic file write: write to a temp file in the same directory,
 * fsync it, then rename over the destination. A reader therefore always sees
 * either the old complete file or the new complete file — never a torn write.
 */
export function atomicWriteFileSync(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, data);
    // Flush file contents to disk before the rename so a crash can't leave a
    // renamed-but-empty file.
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}

/** Append a single line (newline-terminated) to a file, creating it if needed. */
export function appendLineSync(path: string, line: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${line}\n`, { flag: "a" });
}

export interface ReadJsonResult<T> {
  /** Parsed value, or null when the file is missing or unrecoverable. */
  value: T | null;
  /** True when the file existed but could not be parsed/validated. */
  corrupt: boolean;
  /** Path the corrupt file was backed up to, when applicable. */
  backupPath?: string;
}

/**
 * Read + parse JSON defensively. On corruption the bad file is renamed to a
 * timestamped `.corrupt-<ts>` sibling so it is preserved for debugging while
 * the caller falls back to defaults.
 */
export function readJsonSafe<T = unknown>(
  path: string,
  parse: (raw: unknown) => T,
): ReadJsonResult<T> {
  if (!existsSync(path)) return { value: null, corrupt: false };
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { value: null, corrupt: false };
  }
  try {
    return { value: parse(JSON.parse(text)), corrupt: false };
  } catch {
    const backupPath = `${path}.corrupt-${Date.now()}`;
    try {
      renameSync(path, backupPath);
    } catch {
      // If we cannot move it, still report corruption so caller resets.
      return { value: null, corrupt: true };
    }
    return { value: null, corrupt: true, backupPath };
  }
}
