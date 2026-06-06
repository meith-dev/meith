import { existsSync, unlinkSync } from "node:fs";
import net from "node:net";
import {
  ClientMessageSchema,
  NdjsonParser,
  PROTOCOL_VERSION,
  type ServerMessage,
  encodeMessage,
} from "@meith/protocol";
import type { ToolContext, ToolEvent } from "@meith/shared";
import type { ToolRegistry } from "../tools/registry.js";
import type { Logger } from "./Logger.js";

/**
 * Local Unix-socket server speaking newline-delimited JSON. This is how the CLI
 * (and later other local clients) reach the tool registry living in the main
 * process. The main process is the authority; clients only send messages.
 *
 * Per connection it tracks in-flight tool calls so a `cancel_tool_call` can
 * abort them, relays streaming `tool_event`s, and survives malformed frames.
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
    const inflight = new Map<string, AbortController>();
    const send = (msg: ServerMessage) => {
      if (!socket.writableEnded) socket.write(encodeMessage(msg));
    };
    const parser = new NdjsonParser((err, line) => {
      this.logger.warn("Socket", `dropping malformed frame: ${err.message}`);
      send({
        type: "error",
        code: "PROTOCOL_ERROR",
        message: `Malformed JSON frame ignored: ${err.message}`,
      });
      void line;
    });
    socket.setEncoding("utf8");

    socket.on("data", (chunk) => {
      for (const frame of parser.push(chunk)) {
        void this.handleFrame(frame, send, inflight);
      }
    });

    socket.on("error", (err) => {
      this.logger.warn("Socket", `connection error: ${String(err)}`);
    });

    socket.on("close", () => {
      // Cancel anything still running for this dropped client.
      for (const controller of inflight.values()) controller.abort();
      inflight.clear();
    });
  }

  private async handleFrame(
    frame: unknown,
    send: (msg: ServerMessage) => void,
    inflight: Map<string, AbortController>,
  ): Promise<void> {
    const parsed = ClientMessageSchema.safeParse(frame);
    if (!parsed.success) {
      send({
        type: "error",
        code: "PROTOCOL_ERROR",
        message: `Invalid message: ${parsed.error.message}`,
      });
      return;
    }

    const msg = parsed.data;

    if (msg.protocol != null && msg.protocol !== PROTOCOL_VERSION) {
      this.logger.warn(
        "Socket",
        `client protocol ${msg.protocol} != server ${PROTOCOL_VERSION}`,
      );
    }

    if (msg.type === "list_tools") {
      send({ type: "tools_list", tools: this.registry.describe() });
      return;
    }

    if (msg.type === "cancel_tool_call") {
      inflight.get(msg.requestId)?.abort();
      return;
    }

    // tool_call
    const info = msg.clientInfo;
    const ctx: Omit<ToolContext, "signal" | "emit"> = {
      cwd: info.cwd ?? process.cwd(),
      caller: info.caller,
      sessionId: info.sessionId,
      spaceId: info.spaceId,
      tabId: info.tabId,
    };

    const controller = new AbortController();
    inflight.set(msg.requestId, controller);

    const emit = (event: ToolEvent) =>
      send({ type: "tool_event", requestId: msg.requestId, event });

    try {
      const result = await this.registry.call(ctx, msg.toolName, msg.arguments, {
        timeoutMs: msg.timeoutMs,
        signal: controller.signal,
        emit,
      });
      send({ type: "tool_result", requestId: msg.requestId, result });
    } finally {
      inflight.delete(msg.requestId);
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
