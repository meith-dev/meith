import type { ToolDefinition } from "@meith/protocol";
import { PluginApiNameSchema, ToolCapabilitySchema, ToolError } from "@meith/shared";
import { z } from "zod";
import { PluginError } from "../services/PluginHostService.js";
import type { ToolDeps } from "./deps.js";

/** Map a thrown PluginError onto the registry's error codes. */
function rethrowAsToolError(err: unknown): never {
  if (err instanceof PluginError) {
    // The registry models a fixed set of error codes; map plugin-specific
    // failures onto the closest one. Permission failures surface as such;
    // everything else (invalid manifest, path escape, not found, not enabled)
    // is a tool failure with a descriptive message.
    const code = err.code === "PERMISSION_DENIED" ? "PERMISSION_DENIED" : "TOOL_FAILED";
    throw new ToolError(code, err.message);
  }
  throw err;
}

/**
 * Plugin management tools (Phase 11). These run the plugin lifecycle through
 * the central registry so the renderer, CLI, and agents all manage plugins the
 * same way. They are control-plane tools: installing, approving grants, and
 * enabling are privileged mutations, so they require the `destructive`
 * capability (the strongest gate in the capability model).
 */
export function createPluginTools(deps: ToolDeps): ToolDefinition[] {
  const { plugins, browserTabs, logger } = deps;

  return [
    {
      name: "list_plugins",
      description: "List installed plugins with their requested and approved grants.",
      capabilities: ["read-only"],
      inputSchema: z.object({}),
      execute: () => ({ plugins: plugins.list() }),
    },
    {
      name: "install_plugin",
      description:
        "Install (or re-install) a plugin from a local directory containing a plugin manifest. The plugin starts disabled with no approved grants.",
      capabilities: ["destructive"],
      inputSchema: z.object({
        directory: z.string().describe("Absolute path to the plugin directory."),
      }),
      execute: async (_ctx, input) => {
        try {
          return { plugin: await plugins.installFromDirectory(input.directory) };
        } catch (err) {
          rethrowAsToolError(err);
        }
      },
    },
    {
      name: "approve_plugin_grants",
      description:
        "Approve a subset of a plugin's requested capabilities and API scopes. Approval never exceeds what the manifest requested.",
      capabilities: ["destructive"],
      inputSchema: z.object({
        pluginId: z.string(),
        capabilities: z.array(ToolCapabilitySchema).default([]),
        apis: z.array(PluginApiNameSchema).default([]),
      }),
      execute: (_ctx, input) => {
        try {
          return {
            plugin: plugins.approveGrants(input.pluginId, {
              capabilities: input.capabilities,
              apis: input.apis,
            }),
          };
        } catch (err) {
          rethrowAsToolError(err);
        }
      },
    },
    {
      name: "set_plugin_enabled",
      description:
        "Enable or disable an installed plugin. Enabling requires the requested API scopes to be approved first. Disabling revokes any open plugin tabs.",
      capabilities: ["destructive"],
      inputSchema: z.object({
        pluginId: z.string(),
        enabled: z.boolean(),
      }),
      execute: (_ctx, input) => {
        try {
          return { plugin: plugins.setEnabled(input.pluginId, input.enabled) };
        } catch (err) {
          rethrowAsToolError(err);
        }
      },
    },
    {
      name: "uninstall_plugin",
      description: "Uninstall a plugin and revoke any open plugin tabs hosting it.",
      capabilities: ["destructive"],
      inputSchema: z.object({ pluginId: z.string() }),
      execute: (_ctx, input) => {
        try {
          plugins.uninstall(input.pluginId);
          return { uninstalled: input.pluginId };
        } catch (err) {
          rethrowAsToolError(err);
        }
      },
    },
    {
      name: "open_plugin_tab",
      description:
        "Open a browser tab hosting an installed AND enabled plugin. The tab receives the permission-gated plugin bridge.",
      capabilities: ["controls-browser"],
      inputSchema: z.object({
        pluginId: z.string(),
        spaceId: z.string().optional(),
      }),
      execute: async (_ctx, input) => {
        try {
          const plugin = plugins.get(input.pluginId);
          if (!plugin) {
            throw new PluginError(
              "NOT_FOUND",
              `Plugin ${input.pluginId} is not installed.`,
            );
          }
          if (!plugin.enabled) {
            throw new PluginError(
              "NOT_ENABLED",
              `Plugin ${input.pluginId} is not enabled. Approve its permissions and enable it first.`,
            );
          }
          const url = await plugins.resolveEntryUrl(input.pluginId);
          const tab = await browserTabs.openBrowserTab({
            url,
            title: plugin.name,
            spaceId: input.spaceId,
            mode: "plugin",
            pluginId: plugin.id,
          });
          logger.info("Plugins", `opened plugin tab ${tab.id} for ${plugin.id}`);
          return { tab };
        } catch (err) {
          rethrowAsToolError(err);
        }
      },
    },
  ];
}
