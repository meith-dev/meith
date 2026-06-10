import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import net from "node:net";
import {
  ClientMessageSchema,
  NdjsonParser,
  PROTOCOL_VERSION,
  type ServerMessage,
  encodeMessage,
} from "@meith/protocol";
import type { ToolCaller, ToolContext, ToolEvent } from "@meith/shared";
import type { ToolRegistry } from "../tools/registry.js";
import type { Logger } from "./Logger.js";

/**
 * Callers a local socket client is allowed to assert. `renderer`, `agent`, and
 * `internal` are privileged *in-process* identities (they originate inside the
 * main process and are trusted for capability decisions); a remote socket peer
 * must never be able to impersonate them. Anything outside this set is
 * downgraded to the least-privileged `cli` identity.
 */
const SOCKET_ALLOWED_CALLERS: ReadonlySet<ToolCaller> = new Set<ToolCaller>([
  "cli",
  "plugin",
]);
const SOCKET_DEFAULT_CALLER: ToolCaller = "cli";

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
  private readonly connections = new Set<{
    socket: net.Socket;
    inflight: Map<string, AbortController>;
  }>();

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
    const connection = { socket, inflight };
    this.connections.add(connection);
    // Trusted, server-assigned identity for this connection. Used as the tool
    // context `sessionId` so browser ownership is scoped to the connection and
    // cannot be forged via a client-supplied `sessionId`.
    const connectionId = `socket:${randomUUID()}`;
    const send = (msg: ServerMessage) => {
      if (!socket.destroyed && !socket.writableEnded) socket.write(encodeMessage(msg));
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
        void this.handleFrame(frame, send, inflight, connectionId);
      }
    });

    socket.on("error", (err) => {
      this.logger.warn("Socket", `connection error: ${String(err)}`);
    });

    socket.on("close", () => {
      // Cancel anything still running for this dropped client.
      for (const controller of inflight.values()) controller.abort();
      inflight.clear();
      this.connections.delete(connection);
    });
  }

  private async handleFrame(
    frame: unknown,
    send: (msg: ServerMessage) => void,
    inflight: Map<string, AbortController>,
    connectionId: string,
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

    // Reject mismatched protocol versions before doing any work, so an
    // incompatible client can never execute a (possibly mutating) tool after a
    // breaking protocol change. Echo back the requestId when the frame has one.
    if (msg.protocol != null && msg.protocol !== PROTOCOL_VERSION) {
      this.logger.warn(
        "Socket",
        `rejecting client protocol ${msg.protocol} != server ${PROTOCOL_VERSION}`,
      );
      const requestId = "requestId" in msg ? msg.requestId : undefined;
      send({
        type: "error",
        ...(requestId ? { requestId } : {}),
        code: "PROTOCOL_ERROR",
        message: `Unsupported protocol version ${msg.protocol}; server requires ${PROTOCOL_VERSION}`,
      });
      return;
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
    // Server-side identity policy: the socket is the local *untrusted* boundary,
    // so we never let a peer self-assert a privileged caller. A claimed caller
    // outside the allow-list is downgraded to `cli` (and logged), rather than
    // trusting `clientInfo.caller` for capability decisions downstream.
    const caller = this.resolveCaller(info.caller);
    const ctx: Omit<ToolContext, "signal" | "emit"> = {
      cwd: info.cwd ?? process.cwd(),
      caller,
      // Ignore any client-supplied sessionId: ownership/identity is bound to the
      // trusted, server-assigned connection id so a peer cannot impersonate
      // another owner (e.g. to hijack a claimed browser tab).
      sessionId: connectionId,
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

  /**
   * Map a client-claimed caller to one the socket boundary is willing to honor.
   * Privileged in-process identities are downgraded to `cli`.
   */
  private resolveCaller(claimed: ToolCaller): ToolCaller {
    if (SOCKET_ALLOWED_CALLERS.has(claimed)) return claimed;
    this.logger.warn(
      "Socket",
      `client claimed privileged caller "${claimed}"; downgrading to "${SOCKET_DEFAULT_CALLER}"`,
    );
    return SOCKET_DEFAULT_CALLER;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    for (const connection of this.connections) {
      for (const controller of connection.inflight.values()) controller.abort();
      connection.inflight.clear();
      connection.socket.end();
      connection.socket.destroy();
    }
    this.connections.clear();
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
