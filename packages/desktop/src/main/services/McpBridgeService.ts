import { randomBytes } from "node:crypto";
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from "node:http";
import type { ToolDescriptor } from "@meith/protocol";
import type { AgentToolCall, ToolResult } from "@meith/shared";
import { newToolCallId } from "@meith/shared";
import type { Logger } from "./Logger.js";

/** How one session's tools are exposed: describe + a gated call function. */
export interface McpSessionBinding {
  sessionId: string;
  /** Live tool descriptors the agent may call (from the registry). */
  listTools: () => ToolDescriptor[];
  /** Gated tool call (permissions applied) scoped to this session. */
  callTool: (
    toolCall: Pick<AgentToolCall, "id" | "name" | "args">,
  ) => Promise<ToolResult>;
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const PROTOCOL_VERSION = "2025-06-18";
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * An in-process MCP server (Streamable-HTTP-style JSON-RPC over localhost) that
 * exposes the host's tool registry to an external ACP agent subprocess.
 *
 * Each agent session gets a unique bearer token mapped to a session binding, so
 * tool calls arriving over MCP are attributed to `caller: "agent"` + the right
 * `sessionId` (preserving the permission model and browser tab-claim scoping)
 * instead of being downgraded to a generic CLI caller.
 *
 * Hand-rolled on `node:http` to stay dependency-light and consistent with the
 * existing socket/NDJSON layers.
 */
export class McpBridgeService {
  private server: Server | null = null;
  private port = 0;
  private readonly bindings = new Map<string, McpSessionBinding>();

  constructor(private readonly logger: Logger) {}

  /** Start the server lazily; safe to call repeatedly. Returns the base URL. */
  async start(): Promise<string> {
    if (this.server) return this.baseUrl();
    await new Promise<void>((resolve, reject) => {
      const server = createServer((req, res) => {
        void this.handle(req, res);
      });
      server.on("error", reject);
      // Ephemeral port on loopback only — never exposed off the machine.
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        this.port = typeof addr === "object" && addr ? addr.port : 0;
        this.server = server;
        this.logger.info("McpBridge", `listening on ${this.baseUrl()}`);
        resolve();
      });
    });
    return this.baseUrl();
  }

  private baseUrl(): string {
    return `http://127.0.0.1:${this.port}/mcp`;
  }

  /** Mint a token + register a session binding. Returns the endpoint + token. */
  registerSession(binding: McpSessionBinding): { url: string; token: string } {
    const token = randomBytes(24).toString("hex");
    this.bindings.set(token, binding);
    return { url: this.baseUrl(), token };
  }

  /** Drop a session's binding (its token stops working immediately). */
  unregisterSession(sessionId: string): void {
    for (const [token, binding] of this.bindings) {
      if (binding.sessionId === sessionId) this.bindings.delete(token);
    }
  }

  /** Number of live session bindings (used by GC to decide when to stop). */
  get activeSessions(): number {
    return this.bindings.size;
  }

  async stop(): Promise<void> {
    this.bindings.clear();
    const server = this.server;
    if (!server) return;
    this.server = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    const auth = req.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const binding = this.bindings.get(token);
    if (!binding) {
      res
        .writeHead(401, { "content-type": "application/json" })
        .end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    let body: string;
    try {
      body = await readBody(req);
    } catch (err) {
      res
        .writeHead(413, { "content-type": "application/json" })
        .end(JSON.stringify({ error: err instanceof Error ? err.message : "bad body" }));
      return;
    }

    let parsed: JsonRpcRequest;
    try {
      parsed = JSON.parse(body) as JsonRpcRequest;
    } catch {
      res
        .writeHead(400, { "content-type": "application/json" })
        .end(JSON.stringify(rpcError(null, -32700, "Parse error")));
      return;
    }

    const response = await this.dispatch(parsed, binding);
    // Notifications (no id) get a 202 with no body, per JSON-RPC semantics.
    if (response === null) {
      res.writeHead(202).end();
      return;
    }
    res
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify(response));
  }

  private async dispatch(
    req: JsonRpcRequest,
    binding: McpSessionBinding,
  ): Promise<Record<string, unknown> | null> {
    const id = req.id ?? null;
    switch (req.method) {
      case "initialize":
        return rpcOk(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "meith", version: "0.1.0" },
        });
      case "notifications/initialized":
      case "notifications/cancelled":
        return null; // notification: no response
      case "ping":
        return rpcOk(id, {});
      case "tools/list":
        return rpcOk(id, {
          tools: binding.listTools().map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: normalizeSchema(t.inputSchema),
          })),
        });
      case "tools/call": {
        const params = req.params ?? {};
        const name = typeof params.name === "string" ? params.name : "";
        const args =
          params.arguments && typeof params.arguments === "object"
            ? (params.arguments as Record<string, unknown>)
            : {};
        if (!name) {
          return rpcError(id, -32602, "Missing tool name");
        }
        const result = await binding.callTool({ id: newToolCallId(), name, args });
        return rpcOk(id, toMcpToolResult(result));
      }
      default:
        return rpcError(id, -32601, `Method not found: ${req.method ?? "(none)"}`);
    }
  }
}

/** MCP requires an object schema with at least a `type`. */
function normalizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (schema && typeof schema === "object" && "type" in schema) return schema;
  return { type: "object", properties: {}, ...schema };
}

/** Map a meith ToolResult to MCP's tools/call result envelope. */
function toMcpToolResult(result: ToolResult): Record<string, unknown> {
  if (!result.ok) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: result.error
            ? `${result.error.code}: ${result.error.message}`
            : "Tool failed",
        },
      ],
    };
  }
  const text =
    typeof result.content === "string"
      ? result.content
      : JSON.stringify(result.content ?? null);
  return { content: [{ type: "text", text }] };
}

function rpcOk(
  id: string | number | null,
  result: Record<string, unknown>,
): Record<string, unknown> {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
): Record<string, unknown> {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
