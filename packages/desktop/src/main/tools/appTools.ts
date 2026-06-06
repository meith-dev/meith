import { z } from "zod";
import { defineTool, type ToolDefinition } from "@meith/protocol";
import type { ToolDeps } from "./deps.js";

/**
 * App-level and system tools. Several are placeholders that return structured
 * stub results so callers (CLI/agent) can integrate against the final shape.
 */
export function createAppTools(deps: ToolDeps): ToolDefinition[] {
  const appGetState = defineTool({
    name: "app_get_state",
    description: "Return the full persistent application state.",
    inputSchema: z.object({}),
    execute: () => deps.appState.getState(),
  });

  const appGetLogs = defineTool({
    name: "app_get_logs",
    description: "Return recent structured app log entries.",
    inputSchema: z.object({
      limit: z.number().int().positive().max(1000).optional(),
    }),
    execute: (_ctx, input) => deps.logger.list(input.limit),
  });

  const getProcessTree = defineTool({
    name: "get_process_tree",
    description:
      "[placeholder] Return the tree of managed child processes (dev servers, terminals).",
    inputSchema: z.object({}),
    execute: () => ({
      placeholder: true,
      message:
        "get_process_tree is not implemented yet. Will reflect DevServerService/TerminalService PIDs.",
      devServers: deps.devServers.list().map((s) => ({
        id: s.id,
        command: s.command,
        cwd: s.cwd,
        status: s.status,
        pid: s.pid ?? null,
      })),
    }),
  });

  const getProcessLogs = defineTool({
    name: "get_process_logs",
    description:
      "[placeholder] Return captured logs for a managed process (dev server / terminal).",
    inputSchema: z.object({
      processId: z.string().describe("Dev server or terminal id."),
    }),
    execute: (_ctx, input) => {
      const server = deps.devServers.get(input.processId);
      return {
        placeholder: true,
        processId: input.processId,
        logs: server?.logs ?? [],
      };
    },
  });

  return [appGetState, appGetLogs, getProcessTree, getProcessLogs];
}
