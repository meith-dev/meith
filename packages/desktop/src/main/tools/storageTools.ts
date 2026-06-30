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

  const exportSupportBundle = defineTool({
    name: "storage_export_support_bundle",
    description:
      "Export a support bundle with storage metadata, state, recent logs, and recent audit entries.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      logsLimit: z.number().int().positive().max(2000).default(500),
    }),
    execute: (_ctx, input) => {
      const bundle = deps.storage.exportSupportBundle(input.logsLimit);
      const data = Buffer.from(JSON.stringify(bundle, null, 2), "utf8");
      const artifact = deps.artifacts?.write(
        `support-bundle-${Date.now()}`,
        "json",
        data,
      );
      return {
        path: artifact?.path,
        bytes: data.byteLength,
        bundle,
      };
    },
  });

  const clearCollection = defineTool({
    name: "storage_clear_collection",
    description: "Clear a managed storage collection: logs, audit, or artifacts.",
    capabilities: ["destructive"],
    inputSchema: z.object({
      name: z.enum(["logs", "audit", "artifacts"]),
      confirm: z.literal(true).describe("Must be true to confirm destructive clearing."),
    }),
    execute: (_ctx, input) => {
      try {
        return deps.storage.clearCollection(input.name);
      } catch (err) {
        return errorResult(
          "VALIDATION_ERROR",
          err instanceof Error ? err.message : String(err),
          { name: input.name },
        );
      }
    },
  });

  const deleteOldScreenshots = defineTool({
    name: "storage_delete_old_screenshots",
    description: "Delete screenshot PNG artifacts older than the requested age.",
    capabilities: ["destructive"],
    inputSchema: z.object({
      olderThanDays: z.number().int().min(1).max(3650).default(30),
      confirm: z.literal(true).describe("Must be true to confirm screenshot deletion."),
    }),
    execute: (_ctx, input) => deps.storage.deleteOldScreenshots(input.olderThanDays),
  });

  const pruneStaleAgentSessions = defineTool({
    name: "storage_prune_stale_agent_sessions",
    description:
      "Delete non-running agent sessions whose metadata has not changed within the requested age.",
    capabilities: ["destructive"],
    inputSchema: z.object({
      olderThanDays: z.number().int().min(1).max(3650).default(30),
      confirm: z.literal(true).describe("Must be true to confirm agent session pruning."),
    }),
    execute: (_ctx, input) => {
      if (!deps.agents) {
        return errorResult("TOOL_FAILED", "Agent service is not available.");
      }
      const cutoff = Date.now() - input.olderThanDays * 24 * 60 * 60 * 1000;
      const candidates = deps.agents
        .listSessions()
        .filter((session) => session.updatedAt < cutoff && session.status !== "running");
      let deletedSessions = 0;
      for (const session of candidates) {
        if (deps.agents.deleteSession(session.id)) deletedSessions += 1;
      }
      return {
        collection: "agent_sessions",
        deletedSessions,
        cutoff,
      };
    },
  });

  return [
    listCollections,
    readCollection,
    exportState,
    exportSupportBundle,
    clearCollection,
    deleteOldScreenshots,
    pruneStaleAgentSessions,
  ];
}
