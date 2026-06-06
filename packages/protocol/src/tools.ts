import { z } from "zod";
import type { ToolContext } from "@aide/shared";

/**
 * The Tool contract. A Tool is a structured, self-describing unit of behavior
 * that can be invoked identically by the CLI, the renderer/debug UI, a future
 * MCP server, or a future AI agent runtime.
 *
 * Tools are defined with Zod input schemas so we get runtime validation plus
 * static types, and so we can emit JSON Schema for MCP / agent function-calling.
 */
export interface ToolDefinition<
  I extends z.ZodTypeAny = z.ZodTypeAny,
  O = unknown,
> {
  name: string;
  description: string;
  inputSchema: I;
  execute: (ctx: ToolContext, input: z.infer<I>) => Promise<O> | O;
}

/** Helper to define a tool with inference preserved. */
export function defineTool<I extends z.ZodTypeAny, O>(
  def: ToolDefinition<I, O>,
): ToolDefinition<I, O> {
  return def;
}

/**
 * Serializable description of a tool, safe to send over the wire (no functions).
 * `inputSchema` is a best-effort JSON-Schema-ish object for clients/agents.
 */
export const ToolDescriptorSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
});
export type ToolDescriptor = z.infer<typeof ToolDescriptorSchema>;
