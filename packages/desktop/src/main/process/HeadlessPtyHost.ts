import type { PtyHost, PtyProcess, PtySpawnOptions } from "./PtyHost.js";

/**
 * In-memory `PtyHost` with no native dependency.
 *
 * It models a tiny line-oriented shell: it echoes typed input, handles Enter and
 * Backspace, and responds to a small set of commands (`echo`, `pwd`, `help`,
 * `clear`, `exit`). This lets the full terminal lifecycle/streaming/buffer tool
 * surface be exercised by the headless harness and tests without a real PTY,
 * exactly as `HeadlessBrowserViewHost` simulates a DOM for the browser tools.
 */
export class HeadlessPtyHost implements PtyHost {
  spawn(options: PtySpawnOptions): PtyProcess {
    return new HeadlessPty(options);
  }
}

/** Synthetic pids start high to avoid colliding with real OS pids in tooling. */
let fakePidSeq = 90000;

class HeadlessPty implements PtyProcess {
  readonly pid: number;
  private readonly dataCbs = new Set<(chunk: string) => void>();
  private readonly exitCbs = new Set<
    (e: { exitCode: number; signal?: number }) => void
  >();
  private line = "";
  private cwd: string;
  private cols: number;
  private rows: number;
  private closed = false;

  constructor(options: PtySpawnOptions) {
    this.pid = ++fakePidSeq;
    this.cwd = options.cwd;
    this.cols = options.cols;
    this.rows = options.rows;
    // Defer the banner so the owning service can attach its onData listener
    // synchronously after spawn() returns and still receive the first output.
    queueMicrotask(() => {
      if (this.closed) return;
      this.emit(
        `meith headless shell — ${options.shell} (${this.cols}x${this.rows})\r\n`,
      );
      this.prompt();
    });
  }

  write(data: string): void {
    if (this.closed) return;
    for (const ch of data) {
      if (ch === "\r" || ch === "\n") {
        this.emit("\r\n");
        this.run(this.line.trim());
        this.line = "";
        if (!this.closed) this.prompt();
      } else if (ch === "\u007f" || ch === "\b") {
        if (this.line.length > 0) {
          this.line = this.line.slice(0, -1);
          this.emit("\b \b");
        }
      } else {
        this.line += ch;
        this.emit(ch); // local echo
      }
    }
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
  }

  kill(signal?: string): void {
    this.exit(0, signal === "SIGKILL" ? 9 : 15);
  }

  onData(cb: (chunk: string) => void): () => void {
    this.dataCbs.add(cb);
    return () => this.dataCbs.delete(cb);
  }

  onExit(cb: (e: { exitCode: number; signal?: number }) => void): () => void {
    this.exitCbs.add(cb);
    return () => this.exitCbs.delete(cb);
  }

  private run(cmd: string): void {
    if (!cmd) return;
    const [name, ...rest] = cmd.split(/\s+/);
    switch (name) {
      case "echo":
        this.emit(`${rest.join(" ")}\r\n`);
        break;
      case "pwd":
        this.emit(`${this.cwd}\r\n`);
        break;
      case "help":
        this.emit("commands: echo, pwd, help, clear, exit\r\n");
        break;
      case "clear":
        this.emit("\x1b[2J\x1b[H");
        break;
      case "exit":
        this.exit(0);
        break;
      default:
        this.emit(`${name}: command not found\r\n`);
        break;
    }
  }

  private prompt(): void {
    this.emit("$ ");
  }

  private emit(text: string): void {
    for (const cb of this.dataCbs) cb(text);
  }

  private exit(code: number, signal?: number): void {
    if (this.closed) return;
    this.closed = true;
    for (const cb of this.exitCbs) cb({ exitCode: code, signal });
  }
}
