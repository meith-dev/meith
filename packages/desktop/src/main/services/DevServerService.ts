import { EventEmitter } from "node:events";
import type { Logger } from "./Logger.js";

/**
 * STUB dev-server manager.
 *
 * Tracks the metadata we will need (pid, cwd, port, status, logs) once we start
 * spawning real processes. The method surface is final; the bodies are
 * placeholders so the CLI/log-streaming path can be built incrementally.
 */
export interface DevServer {
  id: string;
  cwd: string;
  command: string;
  status: "stopped" | "starting" | "running" | "errored";
  pid?: number;
  port?: number;
  logs: string[];
}

export class DevServerService extends EventEmitter {
  private servers = new Map<string, DevServer>();

  constructor(private readonly logger: Logger) {
    super();
  }

  /** Register (but do not yet spawn) a dev server definition. */
  start(input: { cwd: string; command: string; port?: number }): DevServer {
    const server: DevServer = {
      id: `dev_${Math.random().toString(16).slice(2, 10)}`,
      cwd: input.cwd,
      command: input.command,
      status: "stopped",
      port: input.port,
      logs: [],
    };
    this.servers.set(server.id, server);
    this.logger.warn(
      "DevServer",
      `start() is a stub: would run \`${input.command}\` in ${input.cwd}`,
    );
    // TODO: spawn child_process, set pid, parse port from output, stream logs:
    //   child.stdout.on("data", (d) => this.appendLog(server.id, d.toString()));
    this.emit("change", this.list());
    return server;
  }

  appendLog(id: string, line: string): void {
    const server = this.servers.get(id);
    if (!server) return;
    server.logs.push(line);
    this.emit("log", { id, line });
  }

  stop(id: string): void {
    const server = this.servers.get(id);
    if (!server) return;
    server.status = "stopped";
    // TODO: kill pid.
    this.emit("change", this.list());
  }

  get(id: string): DevServer | undefined {
    return this.servers.get(id);
  }

  list(): DevServer[] {
    return [...this.servers.values()];
  }
}
