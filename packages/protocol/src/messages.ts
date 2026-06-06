import { ToolErrorCodeSchema, ToolEventSchema, ToolResultSchema } from "@meith/shared";
import { z } from "zod";
import { ToolDescriptorSchema } from "./tools.js";

/**
 * Newline-delimited JSON protocol spoken over the local Unix socket (and
 * mirrored over Electron IPC for the renderer).
 *
 * Every message has a `type`. Requests that expect a correlated response carry
 * a `requestId` which is echoed back on every `tool_event` and the final
 * `tool_result` / `error`.
 */

/** Bump when the wire format changes incompatibly. */
export const PROTOCOL_VERSION = 1;

/** Optional protocol-version stamp present on every message. */
const protocolField = z.number().int().optional();

// ---------- Shared sub-schemas ----------

export const CallerSchema = z.enum(["cli", "renderer", "agent", "plugin", "internal"]);
export type Caller = z.infer<typeof CallerSchema>;

/** Identifies who is calling and the scope of the call. Becomes ToolContext. */
export const ClientInfoSchema = z
  .object({
    caller: CallerSchema.default("cli"),
    cwd: z.string().optional(),
    sessionId: z.string().optional(),
    spaceId: z.string().optional(),
    tabId: z.string().optional(),
  })
  .default({ caller: "cli" });
export type ClientInfo = z.infer<typeof ClientInfoSchema>;

// ---------- Requests (client -> server) ----------

export const ListToolsRequestSchema = z.object({
  type: z.literal("list_tools"),
  protocol: protocolField,
  clientInfo: ClientInfoSchema,
});

export const ToolCallRequestSchema = z.object({
  type: z.literal("tool_call"),
  protocol: protocolField,
  requestId: z.string(),
  toolName: z.string(),
  arguments: z.record(z.unknown()).default({}),
  clientInfo: ClientInfoSchema,
  /** Optional per-call timeout override (ms). */
  timeoutMs: z.number().int().positive().optional(),
});

export const CancelRequestSchema = z.object({
  type: z.literal("cancel_tool_call"),
  protocol: protocolField,
  requestId: z.string(),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  ListToolsRequestSchema,
  ToolCallRequestSchema,
  CancelRequestSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ---------- Responses (server -> client) ----------

export const ToolsListResponseSchema = z.object({
  type: z.literal("tools_list"),
  protocol: protocolField,
  tools: z.array(ToolDescriptorSchema),
});

export const ToolEventResponseSchema = z.object({
  type: z.literal("tool_event"),
  protocol: protocolField,
  requestId: z.string(),
  event: ToolEventSchema,
});

export const ToolResultResponseSchema = z.object({
  type: z.literal("tool_result"),
  protocol: protocolField,
  requestId: z.string(),
  result: ToolResultSchema,
});

/** Transport/protocol-level failures only. Tool failures live in `tool_result`. */
export const ErrorResponseSchema = z.object({
  type: z.literal("error"),
  protocol: protocolField,
  requestId: z.string().optional(),
  code: ToolErrorCodeSchema.default("PROTOCOL_ERROR"),
  message: z.string(),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  ToolsListResponseSchema,
  ToolEventResponseSchema,
  ToolResultResponseSchema,
  ErrorResponseSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// ---------- Helpers ----------

/** Encode a message as a single newline-terminated JSON frame, stamping the version. */
export function encodeMessage(msg: Record<string, unknown>): string {
  const stamped =
    "protocol" in msg && msg.protocol != null
      ? msg
      : { ...msg, protocol: PROTOCOL_VERSION };
  return `${JSON.stringify(stamped)}\n`;
}

/** Guards against unbounded buffering from a peer that never sends a newline. */
export const MAX_FRAME_BYTES = 8 * 1024 * 1024;

/**
 * Stateful splitter for newline-delimited JSON. Feed it raw chunks; it returns
 * fully-received JSON objects and buffers any partial trailing frame.
 *
 * Malformed frames do NOT throw out of `push` (which would abort an entire
 * batch and is easy to weaponize): instead each bad line is reported via the
 * optional `onError` callback and skipped, so one garbage frame can't kill the
 * connection. An oversized buffer with no newline is also reported and reset.
 */
export class NdjsonParser {
  private buffer = "";

  constructor(private readonly onError?: (err: Error, line: string) => void) {}

  push(chunk: string | Buffer): unknown[] {
    this.buffer += chunk.toString();
    const out: unknown[] = [];
    let idx = this.buffer.indexOf("\n");
    while (idx >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      idx = this.buffer.indexOf("\n");
      if (line.length === 0) continue;
      try {
        out.push(JSON.parse(line));
      } catch (err) {
        this.onError?.(err as Error, line);
      }
    }
    if (this.buffer.length > MAX_FRAME_BYTES) {
      const overflow = this.buffer;
      this.buffer = "";
      this.onError?.(
        new Error("Frame exceeds MAX_FRAME_BYTES without newline"),
        overflow,
      );
    }
    return out;
  }
}
