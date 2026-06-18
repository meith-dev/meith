import { type ToolDefinition, defineTool } from "@meith/protocol";
import { AppSettingsSchema, okResult } from "@meith/shared";
import { z } from "zod";
import type { ToolDeps } from "./deps.js";

/**
 * Global app-settings tools.
 *
 * Settings live on the persisted `AppState` (so they ride the same reactive
 * broadcast every client already consumes), and are mutated through the shared
 * tool registry like everything else. `get_app_settings` is a convenience read;
 * `set_app_settings` patches a subset of the settings and returns the result.
 */
export function createSettingsTools(deps: ToolDeps): ToolDefinition[] {
  const { appState } = deps;

  const getAppSettings = defineTool({
    name: "get_app_settings",
    description: "Read the global app settings.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => okResult({ settings: appState.getState().settings }),
  });

  const setAppSettings = defineTool({
    name: "set_app_settings",
    description:
      "Patch global app settings (auto-run, confirm/stop-on-close, show-output-on-run, default package manager). Only the provided keys change.",
    capabilities: ["writes-files"],
    inputSchema: z.object({
      settings: AppSettingsSchema.partial(),
    }),
    execute: (_ctx, input) => {
      const next = appState.update((draft) => {
        draft.settings = { ...draft.settings, ...input.settings };
      }, "set_app_settings");
      return okResult({ settings: next.settings });
    },
  });

  return [getAppSettings, setAppSettings];
}
