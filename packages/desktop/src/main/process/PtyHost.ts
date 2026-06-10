/**
 * Abstraction over the platform PTY (pseudo-terminal) backend.
 *
 * Two implementations exist, mirroring the `BrowserViewHost` pattern:
 *  - `HeadlessPtyHost` (default): a pure in-memory simulated shell with NO
 *    native dependency. Used by the headless harness, the socket-only runtime,
 *    and tests. It echoes input and responds to a small set of commands so the
 *    full terminal tool/lifecycle surface can be exercised without a real PTY.
 *  - `NodePtyHost`: backs each terminal with a real `node-pty` process, injected
 *    only from the Electron main entry where the native module is available.
 *
 * `TerminalService` depends on this interface, never on `node-pty` directly, so
 * `bootstrap()` stays headless-safe and testable.
 */

export interface PtySpawnOptions {
  cwd: string;
  shell: string;
  cols: number;
  rows: number;
  /** Extra environment variables merged on top of the host environment. */
  env?: Record<string, string>;
}

/** A live pseudo-terminal process owned by a host. */
export interface PtyProcess {
  /** OS process id, or null when the backend has no real process (headless). */
  readonly pid: number | null;
  /** Write raw input bytes to the PTY. */
  write(data: string): void;
  /** Resize the PTY viewport. */
  resize(cols: number, rows: number): void;
  /** Send a termination signal (default SIGHUP/SIGTERM equivalent). */
  kill(signal?: string): void;
  /** Subscribe to output chunks. Returns an unsubscribe function. */
  onData(cb: (chunk: string) => void): () => void;
  /** Subscribe to process exit. Returns an unsubscribe function. */
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): () => void;
}

export interface PtyHost {
  /** Spawn a new pseudo-terminal process. */
  spawn(options: PtySpawnOptions): PtyProcess;
}
