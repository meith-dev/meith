import { type ToolDefinition, defineTool } from "@meith/protocol";
import { ToolError, okResult } from "@meith/shared";
import { z } from "zod";
import { WorkspaceFileError } from "../services/WorkspaceFileService.js";
import type { ToolDeps } from "./deps.js";

/**
 * Code editor / IDE file tools (Phase 8).
 *
 * These expose the main-process `WorkspaceFileService` through the same registry
 * every caller uses (renderer editor, CLI, future agents), so reading, writing,
 * patching, listing, searching, and diagnosing files all share one set of
 * guardrails: a `cwd` workspace boundary (rejecting out-of-bounds paths unless
 * `allowOutside` is set), write logging, and undo metadata for the diff UI.
 */
export function createFileTools(deps: ToolDeps): ToolDefinition[] {
  const { files } = deps;

  /** Reused boundary fields so every tool documents the contract consistently. */
  const cwd = z.string().min(1).describe("Workspace root the path is resolved against.");
  const allowOutside = z
    .boolean()
    .optional()
    .describe("Permit a path outside all known workspace roots (default false).");

  const readFile = defineTool({
    name: "workspace_read_file",
    description:
      "Read a UTF-8 text file inside the workspace. Rejects paths outside the workspace boundary and binary files.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      cwd,
      path: z.string().min(1).describe("File path, absolute or relative to cwd."),
      allowOutside,
    }),
    execute: (_ctx, input) =>
      withFileErrors(() => okResult(files.readFile(input.cwd, input.path, input))),
  });

  const writeFile = defineTool({
    name: "workspace_write_file",
    description:
      "Write (create or overwrite) a UTF-8 text file inside the workspace. Returns undo metadata so the edit can be reverted/diffed.",
    capabilities: ["writes-files"],
    inputSchema: z.object({
      cwd,
      path: z.string().min(1),
      content: z.string().describe("Full new file contents."),
      createDirs: z
        .boolean()
        .optional()
        .describe("Create missing parent directories (default true for new files)."),
      allowOutside,
    }),
    execute: (_ctx, input) =>
      withFileErrors(() =>
        okResult(
          files.writeFile(input.cwd, input.path, input.content, {
            allowOutside: input.allowOutside,
            createDirs: input.createDirs,
          }),
        ),
      ),
  });

  const applyPatch = defineTool({
    name: "workspace_apply_patch",
    description:
      "Apply structured non-overlapping range edits ({start,end,newText} UTF-16 offsets) to a file. Edits are validated and applied atomically; returns before/after content and undo metadata.",
    capabilities: ["writes-files"],
    inputSchema: z.object({
      cwd,
      path: z.string().min(1),
      edits: z
        .array(
          z.object({
            start: z.number().int().nonnegative(),
            end: z.number().int().nonnegative(),
            newText: z.string(),
          }),
        )
        .min(1)
        .describe("Range edits; must be in-bounds and non-overlapping."),
      allowOutside,
    }),
    execute: (_ctx, input) =>
      withFileErrors(() =>
        okResult(
          files.applyPatch(input.cwd, input.path, input.edits, {
            allowOutside: input.allowOutside,
          }),
        ),
      ),
  });

  const undoWrite = defineTool({
    name: "workspace_undo",
    description:
      "Revert the most recent write/patch to a file, restoring its previous content.",
    capabilities: ["writes-files"],
    inputSchema: z.object({ cwd, path: z.string().min(1), allowOutside }),
    execute: (_ctx, input) =>
      withFileErrors(() =>
        okResult({ undone: files.undoLast(input.cwd, input.path, input) }),
      ),
  });

  const listFiles = defineTool({
    name: "workspace_list_files",
    description:
      "List files and directories inside the workspace (optionally recursive), skipping node_modules/.git and similar. Capped to keep results bounded.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      cwd,
      path: z.string().optional().describe("Subdirectory to list; defaults to cwd."),
      recursive: z.boolean().optional(),
      maxEntries: z.number().int().positive().max(20000).optional(),
      allowOutside,
    }),
    execute: (_ctx, input) =>
      withFileErrors(() =>
        okResult(
          files.listFiles(input.cwd, {
            path: input.path,
            recursive: input.recursive,
            maxEntries: input.maxEntries,
            allowOutside: input.allowOutside,
          }),
        ),
      ),
  });

  const search = defineTool({
    name: "workspace_search",
    description:
      "Search file contents across the workspace for a substring or regex. Returns file/line/column matches, capped.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      cwd,
      query: z.string().min(1),
      isRegex: z.boolean().optional(),
      caseSensitive: z.boolean().optional(),
      maxResults: z.number().int().positive().max(5000).optional(),
      allowOutside,
    }),
    execute: (_ctx, input) =>
      withFileErrors(() =>
        okResult(
          files.search(input.cwd, {
            query: input.query,
            isRegex: input.isRegex,
            caseSensitive: input.caseSensitive,
            maxResults: input.maxResults,
            allowOutside: input.allowOutside,
          }),
        ),
      ),
  });

  const getDiagnostics = defineTool({
    name: "get_diagnostics",
    description:
      "Get TypeScript/JavaScript diagnostics (errors/warnings) for a file, or the opened files of a workspace. Non-TS/JS files return unsupported=true.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      cwd,
      path: z
        .string()
        .optional()
        .describe("File to diagnose; omit for the workspace's opened files."),
      allowOutside,
    }),
    execute: (_ctx, input) =>
      withFileErrors(() => okResult(files.getDiagnostics(input.cwd, input.path, input))),
  });

  return [readFile, writeFile, applyPatch, undoWrite, listFiles, search, getDiagnostics];
}

/** Map `WorkspaceFileError` to a typed tool error; let everything else bubble. */
function withFileErrors<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof WorkspaceFileError) {
      throw new ToolError(
        err.kind === "validation" ? "VALIDATION_ERROR" : "TOOL_FAILED",
        err.message,
      );
    }
    throw err;
  }
}
