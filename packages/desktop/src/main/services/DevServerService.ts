import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  type DevServer,
  type ProcessLogEntry,
  type ProcessStream,
  newDevServerId,
} from "@meith/shared";
import type { Logger } from "./Logger.js";

const MAX_LOG_ENTRIES = 5_000;

/** Heuristics for sniffing the listening port out of dev-server output. */
const PORT_PATTERNS: RegExp[] = [
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d{2,5})/i,
  /(?:listening|running|ready|started|local|preview).{0,40}?:(\d{2,5})\b/i,
  /\bport[:\s]+(\d{2,5})\b/i,
];

export interface DevServerStartInput {
  cwd: string;
  command: string;
  args?: string[];
  name?: string;
  env?: Record<string, string>;
  /**
   * Run the command through a shell. Defaults to false when args are provided
   * so argv is passed safely, and true for a single command string.
   */
  shell?: boolean;
}

export interface DevServerLogEvent {
  id: string;
  entry: ProcessLogEntry;
}

interface LiveDevServer {
  server: DevServer;
  child: ChildProcess | null;
  log: ProcessLogEntry[];
  seq: number;
  /** Carry of an incomplete trailing line per stream until its newline. */
  partial: { stdout: string; stderr: string };
}

/**
 * Spawns and supervises real dev-server child processes.
 *
 * Each server runs in its own process group (detached on POSIX) so the whole
 * tree can be killed together. stdout/stderr are captured into a bounded,
 * sequence-numbered log (streamed via the `"log"` event and replayable through
 * `get_process_logs`), and the listening port is sniffed from the output.
 */
export class DevServerService extends EventEmitter {
  private readonly servers = new Map<string, LiveDevServer>();

  constructor(
    private readonly logger: Logger,
    private readonly runtimeEnv: Record<string, string> = {},
  ) {
    super();
  }

  /** Spawn a dev server and begin capturing its output. */
  start(input: DevServerStartInput): DevServer {
    const id = newDevServerId();
    const args = input.args ?? [];
    const server: DevServer = {
      id,
      name: input.name,
      cwd: input.cwd,
      command: input.command,
      args,
      status: "starting",
      pid: null,
      port: null,
      exitCode: null,
      signal: null,
      startedAt: Date.now(),
    };
    const live: LiveDevServer = {
      server,
      child: null,
      log: [],
      seq: 0,
      partial: { stdout: "", stderr: "" },
    };
    this.servers.set(id, live);

    let child: ChildProcess;
    const shell = input.shell ?? args.length === 0;
    try {
      child = spawn(input.command, args, {
        cwd: input.cwd,
        env: { ...process.env, ...this.runtimeEnv, ...input.env },
        shell,
        // Own process group so we can kill the whole tree via a negative pid.
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      server.status = "errored";
      this.append(live, "system", `failed to spawn: ${message(err)}`);
      this.emit("change", this.list());
      return { ...server };
    }

    live.child = child;
    server.pid = child.pid ?? null;
    server.status = "running";
    this.logger.info(
      "DevServer",
      `started ${id}: ${input.command} ${args.join(" ")} (shell=${shell}, pid=${child.pid ?? "n/a"}) @ ${input.cwd}`,
    );

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (d: string) => this.onOutput(live, "stdout", d));
    child.stderr?.on("data", (d: string) => this.onOutput(live, "stderr", d));
    child.on("error", (err) => {
      server.status = "errored";
      this.append(live, "system", `process error: ${message(err)}`);
      this.emit("change", this.list());
    });
    child.on("exit", (code, signal) => {
      // Flush any buffered partial lines before recording the exit.
      this.flushPartial(live, "stdout");
      this.flushPartial(live, "stderr");
      if (server.status !== "stopped") server.status = "exited";
      server.exitCode = code;
      server.signal = signal;
      this.append(
        live,
        "system",
        `exited with code ${code ?? "null"}${signal ? ` (signal ${signal})` : ""}`,
      );
      this.logger.info("DevServer", `${id} exited (code=${code}, signal=${signal})`);
      this.emit("change", this.list());
    });

    this.emit("change", this.list());
    return { ...server };
  }

  /** Stop a running dev server by killing its process group. */
  stop(id: string, signal: NodeJS.Signals = "SIGTERM"): boolean {
    const live = this.servers.get(id);
    if (!live?.child || live.child.exitCode !== null || live.child.killed) return false;
    // Killing a process group via process.kill(-pid) doesn't flip child.killed,
    // so also guard on our own lifecycle state to keep stop() idempotent.
    if (live.server.status === "stopped" || live.server.status === "exited") return false;
    live.server.status = "stopped";
    killTree(live.child, signal, this.logger);
    this.emit("change", this.list());
    return true;
  }

  get(id: string): DevServer | undefined {
    const live = this.servers.get(id);
    return live ? { ...live.server } : undefined;
  }

  list(): DevServer[] {
    return [...this.servers.values()].map((s) => ({ ...s.server }));
  }

  /** Find dev servers whose cwd matches (used by CLI `devlogs --cwd`). */
  findByCwd(cwd: string): DevServer[] {
    return this.list().filter((s) => s.cwd === cwd);
  }

  /** Captured output for `get_process_logs` (and dev-log replay). */
  getLogs(id: string, limit?: number): ProcessLogEntry[] {
    const live = this.servers.get(id);
    if (!live) return [];
    return limit ? live.log.slice(-limit) : [...live.log];
  }

  /** Stop every running dev server. Called during app shutdown. */
  stopAll(signal: NodeJS.Signals = "SIGTERM"): void {
    for (const live of this.servers.values()) {
      if (live.child && live.child.exitCode === null && !live.child.killed) {
        live.server.status = "stopped";
        killTree(live.child, signal, this.logger);
      }
    }
  }

  private onOutput(live: LiveDevServer, stream: "stdout" | "stderr", data: string): void {
    const buf = live.partial[stream] + data;
    const lines = buf.split("\n");
    live.partial[stream] = lines.pop() ?? "";
    for (const line of lines) this.append(live, stream, line.replace(/\r$/, ""));
  }

  private flushPartial(live: LiveDevServer, stream: "stdout" | "stderr"): void {
    const rest = live.partial[stream];
    live.partial[stream] = "";
    if (rest.length > 0) this.append(live, stream, rest.replace(/\r$/, ""));
  }

  private append(live: LiveDevServer, stream: ProcessStream, text: string): void {
    const entry: ProcessLogEntry = { seq: live.seq++, stream, text, ts: Date.now() };
    live.log.push(entry);
    if (live.log.length > MAX_LOG_ENTRIES) live.log.shift();
    if (live.server.port === null) {
      const port = detectPort(text);
      if (port !== null) {
        live.server.port = port;
        this.emit("change", this.list());
      }
    }
    this.emit("log", { id: live.server.id, entry } satisfies DevServerLogEvent);
  }
}

/** Parse the first plausible port from a line of output. */
function detectPort(text: string): number | null {
  for (const re of PORT_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      const port = Number(m[1]);
      if (port >= 1 && port <= 65535) return port;
    }
  }
  return null;
}

/** Kill a child process and its whole tree, cross-platform. */
function killTree(child: ChildProcess, signal: NodeJS.Signals, logger: Logger): void {
  const pid = child.pid;
  if (pid == null) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"]);
    } else {
      // Negative pid signals the entire process group we created via detached.
      process.kill(-pid, signal);
    }
  } catch (err) {
    logger.warn("DevServer", `kill tree for pid ${pid} failed: ${message(err)}`);
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
