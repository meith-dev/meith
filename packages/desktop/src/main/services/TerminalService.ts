import { EventEmitter } from "node:events";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve as resolvePath } from "node:path";
import { type ProcessLogEntry, type TerminalSession, newTerminalId } from "@meith/shared";
import { HeadlessPtyHost } from "../process/HeadlessPtyHost.js";
import type { PtyHost, PtyProcess } from "../process/PtyHost.js";
import type { Logger } from "./Logger.js";

const MAX_LOG_ENTRIES = 5_000;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

export interface TerminalServiceOptions {
  /** Live PTY backend. Defaults to a headless, in-memory simulated shell. */
  host?: PtyHost;
  /**
   * Base environment merged into every terminal before per-call env. Used to
   * inject the runtime context (e.g. `MEITH_SOCKET` for dev-log attachment and
   * a prepended CLI bin path) so tools/plugins launched in a terminal can reach
   * the running app.
   */
  runtimeEnv?: Record<string, string>;
  /** Default shell when the caller doesn't specify one. */
  defaultShell?: string;
}

export interface CreateTerminalInput {
  cwd?: string;
  shell?: string;
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
}

/** A reconnect snapshot: metadata + the replayable output buffer. */
export interface TerminalSnapshot {
  session: TerminalSession;
  /** Concatenated raw output, suitable for replaying into xterm on reconnect. */
  buffer: string;
  /** The next sequence number, so a client can stream only newer chunks. */
  nextSeq: number;
}

export interface TerminalDataEvent {
  id: string;
  chunk: string;
}

export interface TerminalExitEvent {
  id: string;
  exitCode: number;
  signal?: number;
}

interface LiveTerminal {
  session: TerminalSession;
  pty: PtyProcess;
  log: ProcessLogEntry[];
  seq: number;
  disposers: (() => void)[];
}

/**
 * Manages interactive terminal sessions backed by a pluggable `PtyHost`.
 *
 * Session metadata is serializable (`TerminalSession`); the live PTY handle and
 * a bounded output buffer live in memory. Output is streamed via the `"data"`
 * event (consumed by the renderer over IPC) and retained in a ring buffer so a
 * reconnecting client can replay scrollback and `get_process_logs` works.
 */
export class TerminalService extends EventEmitter {
  private readonly host: PtyHost;
  private readonly runtimeEnv: Record<string, string>;
  private readonly defaultShell: string;
  private readonly terminals = new Map<string, LiveTerminal>();

  constructor(
    private readonly logger: Logger,
    options: TerminalServiceOptions = {},
  ) {
    super();
    this.host = options.host ?? new HeadlessPtyHost();
    this.runtimeEnv = options.runtimeEnv ?? {};
    this.defaultShell = options.defaultShell ?? defaultShell();
  }

  /** Spawn a new terminal and begin streaming its output. */
  create(input: CreateTerminalInput = {}): TerminalSession {
    // Resolve cwd/shell defensively: `node-pty` aborts with an opaque
    // "posix_spawnp failed" if the cwd doesn't exist (e.g. an unexpanded
    // "~/Default") or the shell path is invalid, so normalize both to values we
    // know are usable before spawning.
    const cwd = resolveCwd(input.cwd);
    const shell = resolveShell(input.shell ?? this.defaultShell);
    const cols = input.cols ?? DEFAULT_COLS;
    const rows = input.rows ?? DEFAULT_ROWS;
    const id = newTerminalId();

    const pty = this.host.spawn({
      cwd,
      shell,
      cols,
      rows,
      env: { ...this.runtimeEnv, ...input.env },
    });

    const session: TerminalSession = {
      id,
      cwd,
      shell,
      pid: pty.pid,
      cols,
      rows,
      status: "running",
      createdAt: Date.now(),
      exitCode: null,
    };
    const live: LiveTerminal = { session, pty, log: [], seq: 0, disposers: [] };
    live.disposers.push(pty.onData((chunk) => this.onData(live, chunk)));
    live.disposers.push(pty.onExit((e) => this.onExit(live, e)));
    this.terminals.set(id, live);

    this.logger.info(
      "Terminal",
      `created ${id} (${shell} @ ${cwd}, pid=${pty.pid ?? "n/a"})`,
    );
    this.emit("change", this.list());
    return { ...session };
  }

  /** Write raw input to a terminal's PTY. */
  write(id: string, data: string): void {
    this.require(id).pty.write(data);
  }

  /** Resize a terminal's PTY viewport. */
  resize(id: string, cols: number, rows: number): TerminalSession {
    const live = this.require(id);
    live.pty.resize(cols, rows);
    live.session.cols = cols;
    live.session.rows = rows;
    return { ...live.session };
  }

  /** Send a termination signal to a terminal. */
  kill(id: string, signal?: string): TerminalSession {
    const live = this.require(id);
    live.pty.kill(signal);
    return { ...live.session };
  }

  /** Kill and forget a terminal entirely (e.g. when its UI tab is closed). */
  close(id: string): boolean {
    const live = this.terminals.get(id);
    if (!live) return false;
    try {
      live.pty.kill();
    } catch {
      /* already gone */
    }
    for (const dispose of live.disposers) dispose();
    this.terminals.delete(id);
    this.emit("change", this.list());
    return true;
  }

  get(id: string): TerminalSession | undefined {
    const live = this.terminals.get(id);
    return live ? { ...live.session } : undefined;
  }

  list(): TerminalSession[] {
    return [...this.terminals.values()].map((t) => ({ ...t.session }));
  }

  /** Snapshot a terminal's metadata + replayable buffer for reconnect. */
  snapshot(id: string): TerminalSnapshot {
    const live = this.require(id);
    return {
      session: { ...live.session },
      buffer: live.log.map((e) => e.text).join(""),
      nextSeq: live.seq,
    };
  }

  /** Captured output lines for `get_process_logs`. */
  getLogs(id: string, limit?: number): ProcessLogEntry[] {
    const live = this.require(id);
    return limit ? live.log.slice(-limit) : [...live.log];
  }

  /** Kill every live terminal. Called during app shutdown. */
  killAll(): void {
    for (const live of this.terminals.values()) {
      try {
        live.pty.kill();
      } catch {
        /* ignore */
      }
    }
  }

  private onData(live: LiveTerminal, chunk: string): void {
    live.log.push({ seq: live.seq++, stream: "pty", text: chunk, ts: Date.now() });
    if (live.log.length > MAX_LOG_ENTRIES) live.log.shift();
    this.emit("data", { id: live.session.id, chunk } satisfies TerminalDataEvent);
  }

  private onExit(live: LiveTerminal, e: { exitCode: number; signal?: number }): void {
    live.session.status = "exited";
    live.session.exitCode = e.exitCode ?? null;
    this.logger.info("Terminal", `${live.session.id} exited (code=${e.exitCode})`);
    this.emit("exit", {
      id: live.session.id,
      exitCode: e.exitCode,
      signal: e.signal,
    } satisfies TerminalExitEvent);
    this.emit("change", this.list());
  }

  private require(id: string): LiveTerminal {
    const live = this.terminals.get(id);
    if (!live) throw new Error(`Unknown terminal: ${id}`);
    return live;
  }
}

/** Reasonable default shell per platform. */
function defaultShell(): string {
  if (process.platform === "win32") return process.env.COMSPEC ?? "powershell.exe";
  return process.env.SHELL ?? "/bin/bash";
}

/**
 * Resolve a working directory to an existing one, expanding a leading `~` and
 * falling back to the user's home (then the process cwd) so spawning never
 * fails on a missing directory.
 */
function resolveCwd(input?: string): string {
  const home = homedir();
  let dir = input?.trim() ? input.trim() : home;
  if (dir === "~") dir = home;
  else if (dir.startsWith("~/") || dir.startsWith("~\\")) {
    dir = resolvePath(home, dir.slice(2));
  }
  try {
    if (existsSync(dir) && statSync(dir).isDirectory()) return dir;
  } catch {
    /* fall through to fallbacks */
  }
  if (existsSync(home)) return home;
  return process.cwd();
}

/**
 * Resolve a shell to an executable that actually exists. Absolute paths are
 * verified on disk; bare command names are trusted (resolved via PATH by the
 * PTY). Falls back through common shells to `/bin/sh`.
 */
function resolveShell(input: string): string {
  if (process.platform === "win32") return input;
  const candidates = [
    input,
    process.env.SHELL,
    "/bin/zsh",
    "/bin/bash",
    "/bin/sh",
  ].filter((c): c is string => Boolean(c));
  for (const candidate of candidates) {
    if (!isAbsolute(candidate)) return candidate; // PATH-resolved name
    if (existsSync(candidate)) return candidate;
  }
  return "/bin/sh";
}
