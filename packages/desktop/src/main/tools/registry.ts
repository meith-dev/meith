import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolContext } from "@meith/shared";
import type { ToolDefinition, ToolDescriptor } from "@meith/protocol";

/**
 * The single tool registry. Every caller — CLI (via socket), renderer/debug UI
 * (via IPC), future MCP server, and future AI agent runtime — goes through this
 * same object. Tools validate their input with their Zod schema before running.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: ToolDefinition[]): void {
    for (const t of tools) this.register(t);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Serializable list for `list_tools` / agent function definitions. */
  describe(): ToolDescriptor[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: zodToJsonSchema(tool.inputSchema, {
        $refStrategy: "none",
      }) as Record<string, unknown>,
    }));
  }

  /** Validate input against the tool's schema, then execute it. */
  async call(
    ctx: ToolContext,
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    const parsed = tool.inputSchema.parse(args ?? {});
    return await tool.execute(ctx, parsed);
  }
}
