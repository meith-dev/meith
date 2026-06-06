import net from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import {
  NdjsonParser,
  encodeMessage,
  ServerMessageSchema,
  type ServerMessage,
} from "@aide/protocol";
import { AideConfigSchema, newRequestId, type ToolDescriptor } from "@aide/shared";

export interface ClientOptions {
  socketPath?: string;
  timeoutMs?: number;
}

/**
 * Resolve the runtime socket path. Priority:
 *   1. explicit override (`--socket`)
 *   2. `~/.aide/config.json` written by the desktop/headless bootstrap
 *   3. `$AIDE_USER_DATA/tool.sock` fallback
 */
export function resolveSocketPath(override?: string): string {
  if (override) return override;

  const home = process.env.AIDE_HOME ?? join(homedir(), ".aide");
  const configPath = join(home, "config.json");
  if (existsSync(configPath)) {
    try {
      const cfg = AideConfigSchema.parse(JSON.parse(readFileSync(configPath, "utf8")));
      return cfg.socketPath;
    } catch {
      /* fall through */
    }
  }

  const userData = process.env.AIDE_USER_DATA ?? join(home, "userData");
  return join(userData, "tool.sock");
}

/**
 * A thin newline-delimited JSON client for the desktop tool socket. Pending
 * `tool_call` requests are correlated by `requestId`.
 */
export class ToolClient {
  private socket: net.Socket | null = null;
  private readonly parser = new NdjsonParser();
  private readonly socketPath: string;
  private readonly timeoutMs: number;
  private readonly pending = new Map<
    string,
    {
      resolve: (m: ServerMessage) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private listError: ((m: ServerMessage) => void) | null = null;

  constructor(options: ClientOptions = {}) {
    this.socketPath = resolveSocketPath(options.socketPath);
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  get path(): string {
    return this.socketPath;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.socketPath);
      socket.setEncoding("utf8");
      const onError = (err: Error) => {
        reject(
          new Error(
            `Could not connect to the AIDE runtime at ${this.socketPath}. ` +
              `Is the desktop app (or "pnpm dev:headless") running? (${err.message})`,
          ),
        );
      };
      socket.once("error", onError);
      socket.once("connect", () => {
        socket.off("error", onError);
        this.socket = socket;
        this.attach(socket);
        resolve();
      });
    });
  }

  private attach(socket: net.Socket): void {
    socket.on("data", (chunk) => {
      let frames: unknown[];
      try {
        frames = this.parser.push(chunk);
      } catch {
        return;
      }
      for (const frame of frames) {
        const parsed = ServerMessageSchema.safeParse(frame);
        if (!parsed.success) continue;
        this.dispatch(parsed.data);
      }
    });
    socket.on("close", () => {
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error("Connection closed by runtime"));
      }
      this.pending.clear();
    });
  }

  private dispatch(msg: ServerMessage): void {
    if (msg.type === "tools_list") {
      this.listError?.(msg);
      return;
    }
    if (msg.type === "tool_result" || (msg.type === "error" && msg.requestId)) {
      const id = (msg as { requestId?: string }).requestId;
      if (id && this.pending.has(id)) {
        const entry = this.pending.get(id)!;
        clearTimeout(entry.timer);
        this.pending.delete(id);
        entry.resolve(msg);
        return;
      }
    }
    // An error without a requestId resolves the in-flight list request, if any.
    if (msg.type === "error") this.listError?.(msg);
  }

  /** List the tools exposed by the runtime. */
  listTools(): Promise<ToolDescriptor[]> {
    if (!this.socket) return Promise.reject(new Error("Client is not connected"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listError = null;
        reject(new Error(`"list_tools" timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.listError = (msg) => {
        clearTimeout(timer);
        this.listError = null;
        if (msg.type === "tools_list") resolve(msg.tools);
        else reject(new Error(msg.type === "error" ? msg.message : "Unexpected reply"));
      };
      this.socket!.write(encodeMessage({ type: "list_tools" }));
    });
  }

  /** Invoke a tool by name and resolve with its result (or reject on error). */
  callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.socket) return Promise.reject(new Error("Client is not connected"));
    const requestId = newRequestId();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Tool "${toolName}" timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(requestId, {
        timer,
        resolve: (msg) => {
          if (msg.type === "tool_result") resolve(msg.result);
          else reject(new Error(msg.type === "error" ? msg.message : "Unexpected reply"));
        },
        reject,
      });
      this.socket!.write(
        encodeMessage({
          type: "tool_call",
          requestId,
          toolName,
          arguments: args,
          context: { cwd: process.cwd() },
        }),
      );
    });
  }

  close(): void {
    this.socket?.end();
    this.socket = null;
  }
}
