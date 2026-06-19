import { ToolCapabilitySchema } from "@meith/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAppTools } from "../tools/appTools.js";
import { createBrowserTools } from "../tools/browserTools.js";
import type { ToolDeps } from "../tools/deps.js";
import { createFileTools } from "../tools/fileTools.js";
import { createPluginTools } from "../tools/pluginTools.js";
import { createProcessTools } from "../tools/processTools.js";
import { createProjectTools } from "../tools/projectTools.js";
import { createSettingsTools } from "../tools/settingsTools.js";
import { createSpaceTools } from "../tools/spaceTools.js";
import { createStorageTools } from "../tools/storageTools.js";

const deps = {} as ToolDeps;

const factoryCases = [
  {
    name: "browser",
    tools: createBrowserTools(deps),
    expected: [
      "get_tabs",
      "get_active_tab",
      "open_browser_tab",
      "navigate",
      "go_back",
      "go_forward",
      "refresh",
      "focus_browser_tab",
      "close_browser_tab",
      "browser_use_start",
      "browser_use_end",
      "take_screenshot",
      "get_browser_state",
      "click_element",
      "type_text",
      "scroll_page",
      "send_keys",
      "cdp_command",
      "get_console_logs",
      "get_network_logs",
    ],
  },
  {
    name: "spaces",
    tools: createSpaceTools(deps),
    expected: [
      "list_spaces",
      "create_space",
      "update_space",
      "switch_space",
      "close_space",
      "open_workspace_tab",
      "set_workspace_tab_terminal",
      "set_workspace_tab_file",
      "focus_workspace_tab",
      "close_workspace_tab",
    ],
  },
  {
    name: "process",
    tools: createProcessTools(deps),
    expected: [
      "create_terminal",
      "list_terminals",
      "write_terminal",
      "resize_terminal",
      "kill_terminal",
      "close_terminal",
      "get_terminal_snapshot",
      "start_dev_server",
      "list_dev_servers",
      "stop_dev_server",
      "get_process_tree",
      "get_process_logs",
      "attach_process_logs",
    ],
  },
  {
    name: "projects",
    tools: createProjectTools(deps),
    expected: [
      "project_list",
      "project_detect",
      "project_open",
      "project_start_dev_server",
      "project_stop_dev_server",
      "project_run",
      "project_set_run_config",
      "project_list_templates",
      "project_create",
      "project_create_plugin",
      "project_prewarm",
      "project_prewarm_status",
      "project_allocate",
    ],
  },
  {
    name: "files",
    tools: createFileTools(deps),
    expected: [
      "workspace_read_file",
      "workspace_write_file",
      "workspace_apply_patch",
      "workspace_undo",
      "workspace_list_files",
      "workspace_search",
      "get_diagnostics",
    ],
  },
  {
    name: "storage",
    tools: createStorageTools(deps),
    expected: [
      "storage_list_collections",
      "storage_read_collection",
      "storage_export_state",
    ],
  },
  {
    name: "plugins",
    tools: createPluginTools(deps),
    expected: [
      "list_plugins",
      "install_plugin",
      "approve_plugin_grants",
      "set_plugin_enabled",
      "uninstall_plugin",
      "open_plugin_tab",
    ],
  },
  {
    name: "settings",
    tools: createSettingsTools(deps),
    expected: ["get_app_settings", "set_app_settings"],
  },
  {
    name: "app",
    tools: createAppTools(deps),
    expected: [
      "app_get_state",
      "app_get_logs",
      "app_list_instances",
      "app_health",
      "app_set_debug_mode",
      "app_export_bug_report",
      "app_screenshot",
    ],
  },
] as const;

describe("tool factory contracts", () => {
  for (const { name, tools, expected } of factoryCases) {
    it(`${name} registers the expected tool surface`, () => {
      expect(tools.map((tool) => tool.name)).toEqual(expected);
    });
  }

  it("gives every tool stable metadata and a Zod input schema", () => {
    const all = factoryCases.flatMap(({ tools }) => tools);
    const names = all.map((tool) => tool.name);

    expect(new Set(names).size).toBe(names.length);

    for (const tool of all) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(tool.description.trim().length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeInstanceOf(z.ZodType);
      expect(tool.execute).toBeTypeOf("function");

      for (const capability of tool.capabilities ?? []) {
        expect(ToolCapabilitySchema.safeParse(capability).success).toBe(true);
      }
    }
  });
});
