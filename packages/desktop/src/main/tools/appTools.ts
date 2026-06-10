import { type ToolDefinition, defineTool } from "@meith/protocol";
import { z } from "zod";
import type { ToolDeps } from "./deps.js";

/**
 * App-level and system tools. Several are placeholders that return structured
 * stub results so callers (CLI/agent) can integrate against the final shape.
 */
export function createAppTools(deps: ToolDeps): ToolDefinition[] {
  const appGetState = defineTool({
    name: "app_get_state",
    description: "Return the full persistent application state.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => deps.appState.getState(),
  });

  const appGetLogs = defineTool({
    name: "app_get_logs",
    description: "Return recent structured app log entries.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      limit: z.number().int().positive().max(1000).optional(),
    }),
    execute: (_ctx, input) => deps.logger.list(input.limit),
  });

  return [appGetState, appGetLogs];
}
