import net from "node:net";
import { existsSync, unlinkSync } from "node:fs";
import {
  ClientMessageSchema,
  NdjsonParser,
  encodeMessage,
  type ServerMessage,
} from "@aide/protocol";
import type { ToolContext } from "@aide/shared";
import type { ToolRegistry } from "../tools/registry.js";
import type { Logger } from "./Logger.js";

/**
 * Local Unix-socket server speaking newline-delimited JSON. This is how the CLI
 * (and later other local clients) reach the tool registry living in the main
 * process. The main process is the authority; clients only send messages.
 */
export class ToolSocketService {
  private server: net.Server | null = null;

  constructor(
    private readonly socketPath: string,
    private readonly registry: ToolRegistry,
    private readonly logger: Logger,
  ) {}

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Clean up a stale socket file from a previous crash.
      if (existsSync(this.socketPath)) {
        try {
          unlinkSync(this.socketPath);
        } catch {
          /* ignore */
        }
      }

      this.server = net.createServer((socket) => this.handleConnection(socket));
      this.server.on("error", (err) => {
        this.logger.error("Socket", `server error: ${String(err)}`);
        reject(err);
      });
      this.server.listen(this.socketPath, () => {
        this.logger.info("Socket", `listening at ${this.socketPath}`);
        resolve();
      });
    });
  }

  private handleConnection(socket: net.Socket): void {
    const parser = new NdjsonParser();
    socket.setEncoding("utf8");

    const send = (msg: ServerMessage) => socket.write(encodeMessage(msg));

    socket.on("data", async (chunk) => {
      let parsedFrames: unknown[];
      try {
        parsedFrames = parser.push(chunk);
      } catch (err) {
        send({ type: "error", message: `Malformed JSON: ${String(err)}` });
        return;
      }

      for (const frame of parsedFrames) {
        await this.handleFrame(frame, send);
      }
    });

    socket.on("error", (err) => {
      this.logger.warn("Socket", `connection error: ${String(err)}`);
    });
  }

  private async handleFrame(
    frame: unknown,
    send: (msg: ServerMessage) => void,
  ): Promise<void> {
    const parsed = ClientMessageSchema.safeParse(frame);
    if (!parsed.success) {
      send({
        type: "error",
        message: `Invalid message: ${parsed.error.message}`,
      });
      return;
    }

    const msg = parsed.data;

    if (msg.type === "list_tools") {
      send({ type: "tools_list", tools: this.registry.describe() });
      return;
    }

    // tool_call
    const ctx: ToolContext = {
      cwd: msg.context.cwd ?? process.cwd(),
      caller: "cli",
    };
    try {
      const result = await this.registry.call(ctx, msg.toolName, msg.arguments);
      send({ type: "tool_result", requestId: msg.requestId, result });
    } catch (err) {
      send({
        type: "error",
        requestId: msg.requestId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
    if (existsSync(this.socketPath)) {
      try {
        unlinkSync(this.socketPath);
      } catch {
        /* ignore */
      }
    }
  }
}
