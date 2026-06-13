import { type ToolDefinition, defineTool } from "@meith/protocol";
import { ToolError } from "@meith/shared";
import { z } from "zod";
import type { ArtifactStore } from "../storage/ArtifactStore.js";
import type { ToolDeps } from "./deps.js";

/** Extra, Electron-provided capabilities the app tools can use when available. */
export interface AppToolOptions {
  /** Persist screenshot PNGs when available (headless callers may omit it). */
  artifacts?: ArtifactStore;
  /** Capture the main application window as a PNG buffer. */
  captureAppWindow?: () => Promise<Buffer>;
}

/**
 * App-level and system tools. Several are placeholders that return structured
 * stub results so callers (CLI/agent) can integrate against the final shape.
 */
export function createAppTools(
  deps: ToolDeps,
  options: AppToolOptions = {},
): ToolDefinition[] {
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

  const appScreenshot = defineTool({
    name: "app_screenshot",
    description:
      "Capture a screenshot of the main application window. Persists a PNG artifact when storage is available and returns its path.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: async () => {
      if (!options.captureAppWindow) {
        throw new ToolError(
          "TOOL_FAILED",
          "No application window is available to capture (running headless).",
        );
      }
      let data: Buffer;
      try {
        data = await options.captureAppWindow();
      } catch (err) {
        throw new ToolError(
          "TOOL_FAILED",
          err instanceof Error ? err.message : String(err),
        );
      }
      let path: string | undefined;
      if (options.artifacts) {
        const info = options.artifacts.write(`app-${Date.now()}`, "png", data);
        path = info.path;
      }
      return { bytes: data.byteLength, path };
    },
  });

  return [appGetState, appGetLogs, appScreenshot];
}
