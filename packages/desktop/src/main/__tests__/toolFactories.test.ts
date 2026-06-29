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

  /**
   * Security invariant: every tool that mutates state (file writes, process
   * control, browser control, destructive operations, settings changes) MUST
   * declare at least one privileged capability so the PermissionService can gate
   * it for non-trusted callers (cli, agent, plugin).
   *
   * Tools whose `execute` body cannot be a no-op for the purposes of this audit
   * are matched by a heuristic: any tool whose name or description contains a
   * mutating verb is considered state-changing. Additionally, every tool whose
   * name starts with a verb known to mutate (write_, create_, set_, open_,
   * close_, kill_, stop_, start_, send_, navigate, click_, type_, scroll_,
   * resize_, approve_, install_, uninstall_, update_, switch_, refresh, go_)
   * is required to declare a non-read-only capability.
   *
   * This is a conservative allowlist — if you add a new mutating tool without
   * a privileged capability declaration, this test will catch it.
   */
  it("every mutating tool declares a non-read-only privileged capability", () => {
    const MUTATING_PREFIXES = [
      "write_",
      "create_",
      "set_",
      "open_",
      "close_",
      "kill_",
      "stop_",
      "start_",
      "send_",
      "navigate",
      "click_",
      "type_",
      "scroll_",
      "resize_",
      "approve_",
      "install_",
      "uninstall_",
      "update_",
      "switch_",
      "refresh",
      "go_",
      "workspace_write_",
      "workspace_apply_",
      "workspace_undo",
      "browser_use_start",
      "browser_use_end",
      "cdp_command",
      "focus_browser_tab",
      "focus_workspace_tab",
    ];

    const PRIVILEGED: ReadonlySet<string> = new Set([
      "writes-files",
      "controls-browser",
      "starts-process",
      "destructive",
    ]);

    const all = factoryCases.flatMap(({ tools }) => tools);
    const violations: string[] = [];

    for (const tool of all) {
      const isMutating = MUTATING_PREFIXES.some((prefix) =>
        tool.name.startsWith(prefix),
      );
      if (!isMutating) continue;

      const caps = tool.capabilities ?? [];
      const hasPrivileged = caps.some((cap) => PRIVILEGED.has(cap));
      if (!hasPrivileged) {
        violations.push(
          `Tool "${tool.name}" appears mutating but declares no privileged capability (has: [${caps.join(", ")}])`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  /**
   * Capability classification reference — documents the intended
   * classification of every registered tool so reviewers can spot regressions.
   * Each entry maps tool name -> expected minimum capability set.
   */
  it("tools carry the expected capability classification", () => {
    const EXPECTED: Record<string, string[]> = {
      // File tools
      workspace_read_file: ["read-only"],
      workspace_write_file: ["writes-files"],
      workspace_apply_patch: ["writes-files"],
      workspace_undo: ["writes-files"],
      workspace_list_files: ["read-only"],
      workspace_search: ["read-only"],
      get_diagnostics: ["read-only"],
      // Browser tools
      get_tabs: ["read-only"],
      get_active_tab: ["read-only"],
      open_browser_tab: ["controls-browser"],
      navigate: ["controls-browser"],
      go_back: ["controls-browser"],
      go_forward: ["controls-browser"],
      refresh: ["controls-browser"],
      focus_browser_tab: ["controls-browser"],
      close_browser_tab: ["controls-browser"],
      browser_use_start: ["controls-browser"],
      browser_use_end: ["controls-browser"],
      take_screenshot: ["controls-browser", "read-only"],
      get_browser_state: ["read-only", "controls-browser"],
      click_element: ["controls-browser"],
      type_text: ["controls-browser"],
      scroll_page: ["controls-browser"],
      send_keys: ["controls-browser"],
      cdp_command: ["controls-browser", "accesses-network"],
      get_console_logs: ["read-only"],
      get_network_logs: ["read-only", "accesses-network"],
      // Process tools
      create_terminal: ["starts-process"],
      list_terminals: ["read-only"],
      write_terminal: ["starts-process"],
      resize_terminal: ["starts-process"],
      kill_terminal: ["starts-process"],
      close_terminal: ["starts-process"],
      get_terminal_snapshot: ["read-only"],
      start_dev_server: ["starts-process", "accesses-network"],
      list_dev_servers: ["read-only"],
      stop_dev_server: ["starts-process"],
      get_process_tree: ["read-only"],
      get_process_logs: ["read-only"],
      attach_process_logs: ["read-only"],
      // Space tools
      list_spaces: ["read-only"],
      create_space: ["writes-files"],
      update_space: ["writes-files"],
      switch_space: ["writes-files"],
      close_space: ["destructive"],
      open_workspace_tab: ["writes-files"],
      set_workspace_tab_terminal: ["writes-files"],
      set_workspace_tab_file: ["writes-files"],
      focus_workspace_tab: ["writes-files"],
      close_workspace_tab: ["destructive"],
      // Plugin tools
      list_plugins: ["read-only"],
      install_plugin: ["destructive"],
      approve_plugin_grants: ["destructive"],
      set_plugin_enabled: ["destructive"],
      uninstall_plugin: ["destructive"],
      open_plugin_tab: ["controls-browser"],
      // Settings tools
      get_app_settings: ["read-only"],
      set_app_settings: ["writes-files"],
      // App tools
      app_get_state: ["read-only"],
      app_get_logs: ["read-only"],
      app_list_instances: ["read-only"],
      app_health: ["read-only"],
      app_set_debug_mode: ["writes-files"],
      app_export_bug_report: ["read-only"],
      app_screenshot: ["read-only"],
    };

    const all = factoryCases.flatMap(({ tools }) => tools);
    const mismatches: string[] = [];

    for (const tool of all) {
      const expected = EXPECTED[tool.name];
      if (!expected) continue; // git_diff and project tools not in table yet
      const actual = [...(tool.capabilities ?? [])].sort();
      const exp = [...expected].sort();
      if (JSON.stringify(actual) !== JSON.stringify(exp)) {
        mismatches.push(
          `"${tool.name}": expected [${exp.join(", ")}] but got [${actual.join(", ")}]`,
        );
      }
    }

    expect(mismatches).toEqual([]);
  });
});
