import { z } from "zod";
import { ToolDescriptorSchema } from "./tools.js";

/**
 * Newline-delimited JSON protocol spoken over the local Unix socket.
 *
 * Every message has a `type`. Requests that expect a correlated response carry
 * a `requestId` which is echoed back on the matching response/error.
 */

// ---------- Requests (client -> server) ----------

export const ListToolsRequestSchema = z.object({
  type: z.literal("list_tools"),
});

export const ToolCallRequestSchema = z.object({
  type: z.literal("tool_call"),
  requestId: z.string(),
  toolName: z.string(),
  arguments: z.record(z.unknown()).default({}),
  context: z
    .object({
      cwd: z.string().optional(),
    })
    .default({}),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  ListToolsRequestSchema,
  ToolCallRequestSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ---------- Responses (server -> client) ----------

export const ToolsListResponseSchema = z.object({
  type: z.literal("tools_list"),
  tools: z.array(ToolDescriptorSchema),
});

export const ToolResultResponseSchema = z.object({
  type: z.literal("tool_result"),
  requestId: z.string(),
  result: z.unknown(),
});

export const ErrorResponseSchema = z.object({
  type: z.literal("error"),
  requestId: z.string().optional(),
  message: z.string(),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  ToolsListResponseSchema,
  ToolResultResponseSchema,
  ErrorResponseSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// ---------- Helpers ----------

/** Encode a message as a single newline-terminated JSON frame. */
export function encodeMessage(msg: unknown): string {
  return JSON.stringify(msg) + "\n";
}

/**
 * Stateful splitter for newline-delimited JSON. Feed it raw chunks; it returns
 * fully-received JSON objects and buffers any partial trailing frame.
 */
export class NdjsonParser {
  private buffer = "";

  push(chunk: string | Buffer): unknown[] {
    this.buffer += chunk.toString();
    const out: unknown[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (line.length === 0) continue;
      out.push(JSON.parse(line));
    }
    return out;
  }
}
