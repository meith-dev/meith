import { EventEmitter } from "node:events";
import type { Logger } from "./Logger.js";

/**
 * STUB terminal/PTY service.
 *
 * A real implementation would spawn a pty (e.g. node-pty), track sessions, and
 * stream data to the renderer and CLI. Here we only model the surface so other
 * services (DevServerService) and the UI can be built against it.
 */
export interface TerminalSession {
  id: string;
  cwd: string;
  shell: string;
  pid?: number;
}

export class TerminalService extends EventEmitter {
  private sessions = new Map<string, TerminalSession>();

  constructor(private readonly logger: Logger) {
    super();
  }

  create(cwd: string, shell = process.env.SHELL ?? "/bin/bash"): TerminalSession {
    const session: TerminalSession = {
      id: `term_${Math.random().toString(16).slice(2, 10)}`,
      cwd,
      shell,
    };
    this.sessions.set(session.id, session);
    this.logger.warn("Terminal", `create() is a stub (no pty spawned) for ${session.id}`);
    // TODO: spawn pty, wire data events: this.emit("data", { id, chunk }).
    return session;
  }

  write(id: string, _data: string): void {
    if (!this.sessions.has(id)) throw new Error(`Unknown terminal: ${id}`);
    // TODO: write to pty.
  }

  list(): TerminalSession[] {
    return [...this.sessions.values()];
  }
}
