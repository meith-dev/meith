import { z } from "zod";
import type { ToolContext } from "@meith/shared";

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

/**
 * Helper to define a tool. The generic parameters give you full inference and
 * type-checking inside `execute` at the definition site, while the return type
 * is widened to the base `ToolDefinition` so heterogeneous tools can live in a
 * single `ToolDefinition[]` (Zod schema generics are invariant otherwise).
 */
export function defineTool<I extends z.ZodTypeAny, O>(
  def: ToolDefinition<I, O>,
): ToolDefinition {
  return def as unknown as ToolDefinition;
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
