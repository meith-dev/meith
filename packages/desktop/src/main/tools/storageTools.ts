import { type ToolDefinition, defineTool } from "@meith/protocol";
import { errorResult } from "@meith/shared";
import { z } from "zod";
import type { ToolDeps } from "./deps.js";

/**
 * Read-only tools for inspecting durable storage. Let the CLI/agents see what
 * is persisted and where, without reaching into individual services.
 */
export function createStorageTools(deps: ToolDeps): ToolDefinition[] {
  const listCollections = defineTool({
    name: "storage_list_collections",
    description: "List durable storage collections with kind, path, and size.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => ({
      dataDirectory: deps.storage.dataDirectory,
      collections: deps.storage.listCollections(),
    }),
  });

  const readCollection = defineTool({
    name: "storage_read_collection",
    description:
      "Read a storage collection by name. For append-only collections, returns the most recent records.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      name: z.string().describe("Collection name, e.g. 'state' or 'logs'."),
      limit: z.number().int().positive().max(5000).optional(),
    }),
    execute: (_ctx, input) => {
      try {
        return deps.storage.readCollection(input.name, input.limit);
      } catch (err) {
        return errorResult(
          "VALIDATION_ERROR",
          err instanceof Error ? err.message : String(err),
          { name: input.name },
        );
      }
    },
  });

  const exportState = defineTool({
    name: "storage_export_state",
    description:
      "Export a full snapshot of persisted state plus storage metadata for backup/debugging.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => deps.storage.exportState(),
  });

  return [listCollections, readCollection, exportState];
}
