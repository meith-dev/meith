/**
 * Declarative mapping from a friendly kebab-case CLI command to a runtime tool
 * name (snake_case) plus the ordered positional argument slots that feed its
 * params. The generic `call <toolName>` escape hatch can reach any tool.
 */
export interface CommandSpec {
  tool: string;
  positionals: string[];
  summary: string;
  arrayFlags?: string[];
}

export const commands: Record<string, CommandSpec> = {
  // Browser tabs and automation.
  tabs: {
    tool: "get_tabs",
    positionals: [],
    summary: "List browser and workspace tabs",
  },
  open: {
    tool: "open_browser_tab",
    positionals: ["url"],
    summary: "Open a new browser tab at <url>",
  },
  "active-tab": {
    tool: "get_active_tab",
    positionals: [],
    summary: "Show the active browser tab",
  },
  navigate: {
    tool: "navigate",
    positionals: ["tabId", "url"],
    summary: "Navigate <tabId> to <url>",
  },
  back: {
    tool: "go_back",
    positionals: ["tabId"],
    summary: "Navigate <tabId> back in history",
  },
  forward: {
    tool: "go_forward",
    positionals: ["tabId"],
    summary: "Navigate <tabId> forward in history",
  },
  refresh: {
    tool: "refresh",
    positionals: ["tabId"],
    summary: "Reload <tabId>",
  },
  focus: {
    tool: "focus_browser_tab",
    positionals: ["tabId"],
    summary: "Focus/activate <tabId>",
  },
  close: {
    tool: "close_browser_tab",
    positionals: ["tabId"],
    summary: "Close <tabId>",
  },
  "browser-claim": {
    tool: "browser_use_start",
    positionals: ["tabId"],
    summary: "Claim exclusive automation control of <tabId>",
  },
  "browser-release": {
    tool: "browser_use_end",
    positionals: ["tabId"],
    summary: "Release automation control of <tabId>",
  },
  "browser-state": {
    tool: "get_browser_state",
    positionals: ["tabId"],
    summary: "Extract interactable browser state for <tabId>",
  },
  click: {
    tool: "click_element",
    positionals: ["tabId", "elementId"],
    summary: "Click an element in <tabId> by browser-state id",
  },
  type: {
    tool: "type_text",
    positionals: ["tabId", "elementId", "text"],
    summary: "Type text into an element in <tabId>",
  },
  scroll: {
    tool: "scroll_page",
    positionals: ["tabId"],
    summary: "Scroll <tabId> (--deltaY/--deltaX or --toY/--toX)",
  },
  keys: {
    tool: "send_keys",
    positionals: ["tabId", "keys"],
    summary: "Send keyboard input to <tabId>",
  },
  cdp: {
    tool: "cdp_command",
    positionals: ["tabId", "method"],
    summary: "Run a Chrome DevTools Protocol command (--params-json)",
  },
  console: {
    tool: "get_console_logs",
    positionals: ["tabId"],
    summary: "Print captured console logs for <tabId>",
  },
  network: {
    tool: "get_network_logs",
    positionals: ["tabId"],
    summary: "Print captured network logs for <tabId>",
  },
  screenshot: {
    tool: "take_screenshot",
    positionals: ["tabId"],
    summary: "Capture a screenshot of a browser tab",
  },

  // App/runtime.
  state: {
    tool: "app_get_state",
    positionals: [],
    summary: "Print the full persistent app state",
  },
  logs: {
    tool: "app_get_logs",
    positionals: [],
    summary: "Print recent app log entries (--limit N)",
  },
  health: {
    tool: "app_health",
    positionals: [],
    summary: "Print runtime service health",
  },
  instances: {
    tool: "app_list_instances",
    positionals: [],
    summary: "List runtime instances through the active runtime",
  },
  "bug-report": {
    tool: "app_export_bug_report",
    positionals: [],
    summary: "Export a reproducible bug report artifact",
  },
  "app-screenshot": {
    tool: "app_screenshot",
    positionals: [],
    summary: "Capture the main app window screenshot",
  },
  "debug-mode": {
    tool: "app_set_debug_mode",
    positionals: ["enabled"],
    summary: "Enable or disable runtime debug mode",
  },

  // Spaces and workspace tabs.
  spaces: {
    tool: "list_spaces",
    positionals: [],
    summary: "List spaces and the active space id",
  },
  "create-space": {
    tool: "create_space",
    positionals: ["name"],
    summary: "Create and switch to a new space",
  },
  "update-space": {
    tool: "update_space",
    positionals: ["spaceId"],
    summary: "Rename/recolor a space (--name/--color)",
  },
  "switch-space": {
    tool: "switch_space",
    positionals: ["spaceId"],
    summary: "Switch the active space",
  },
  "close-space": {
    tool: "close_space",
    positionals: ["spaceId"],
    summary: "Close a space and its tabs",
  },
  "open-workspace-tab": {
    tool: "open_workspace_tab",
    positionals: ["title", "cwd"],
    summary: "Open an editor/terminal/agent/preview/diff tab",
  },
  "set-tab-terminal": {
    tool: "set_workspace_tab_terminal",
    positionals: ["tabId", "terminalId"],
    summary: "Associate a workspace tab with a terminal session",
  },
  "set-tab-file": {
    tool: "set_workspace_tab_file",
    positionals: ["tabId"],
    summary: "Set an editor tab's focused/open files",
    arrayFlags: ["openFilePaths"],
  },
  "focus-workspace-tab": {
    tool: "focus_workspace_tab",
    positionals: ["tabId"],
    summary: "Focus a workspace tab",
  },
  "close-workspace-tab": {
    tool: "close_workspace_tab",
    positionals: ["tabId"],
    summary: "Close a workspace tab",
  },

  // Projects.
  projects: {
    tool: "project_list",
    positionals: [],
    summary: "List known projects",
  },
  "detect-project": {
    tool: "project_detect",
    positionals: ["cwd"],
    summary: "Detect project metadata for a directory",
  },
  "open-project": {
    tool: "project_open",
    positionals: ["cwd"],
    summary: "Open a project folder into a dedicated space",
  },
  "start-project": {
    tool: "project_start_dev_server",
    positionals: ["projectId"],
    summary: "Start a project's detected dev/start script",
  },
  "stop-project": {
    tool: "project_stop_dev_server",
    positionals: ["projectId"],
    summary: "Stop dev servers associated with a project",
  },
  "run-project": {
    tool: "project_run",
    positionals: ["projectId"],
    summary: "Run a project's configured/default run command",
  },
  "set-run-config": {
    tool: "project_set_run_config",
    positionals: ["projectId"],
    summary: "Replace a project's run config (--runConfig-json)",
  },
  templates: {
    tool: "project_list_templates",
    positionals: [],
    summary: "List available project templates",
  },
  "create-project": {
    tool: "project_create",
    positionals: ["template"],
    summary: "Create a project from a template",
  },
  "create-plugin-project": {
    tool: "project_create_plugin",
    positionals: ["name"],
    summary: "Create a new plugin project",
  },
  prewarm: {
    tool: "project_prewarm",
    positionals: [],
    summary: "Prewarm generated app projects (--count N)",
  },
  "prewarm-status": {
    tool: "project_prewarm_status",
    positionals: [],
    summary: "Show the prewarmed project buffer status",
  },
  allocate: {
    tool: "project_allocate",
    positionals: ["name"],
    summary: "Allocate/open a ready generated app project",
  },

  // Workspace files and git.
  read: {
    tool: "workspace_read_file",
    positionals: ["cwd", "path"],
    summary: "Read a workspace text file",
  },
  write: {
    tool: "workspace_write_file",
    positionals: ["cwd", "path", "content"],
    summary: "Write a workspace text file",
  },
  patch: {
    tool: "workspace_apply_patch",
    positionals: ["cwd", "path"],
    summary: "Apply range edits to a file (--edits-json)",
  },
  undo: {
    tool: "workspace_undo",
    positionals: ["cwd", "path"],
    summary: "Undo the last write/patch for a file",
  },
  files: {
    tool: "workspace_list_files",
    positionals: ["cwd"],
    summary: "List workspace files",
  },
  search: {
    tool: "workspace_search",
    positionals: ["cwd", "query"],
    summary: "Search workspace file contents",
  },
  diagnostics: {
    tool: "get_diagnostics",
    positionals: ["cwd", "path"],
    summary: "Get TS/JS diagnostics for a file or workspace",
  },
  diff: {
    tool: "git_diff",
    positionals: ["cwd"],
    summary: "Summarize a git working-tree diff",
  },

  // Terminals, dev servers, and processes.
  "create-terminal": {
    tool: "create_terminal",
    positionals: [],
    summary: "Spawn an interactive terminal session",
  },
  processes: {
    tool: "get_process_tree",
    positionals: [],
    summary: "List managed child processes with ports and OS subtree",
  },
  "process-logs": {
    tool: "get_process_logs",
    positionals: ["processId"],
    summary: "Print captured logs for a managed process (--limit N)",
  },
  terminals: {
    tool: "list_terminals",
    positionals: [],
    summary: "List active terminal sessions",
  },
  "write-terminal": {
    tool: "write_terminal",
    positionals: ["terminalId", "data"],
    summary: "Write raw input to a terminal session",
  },
  "resize-terminal": {
    tool: "resize_terminal",
    positionals: ["terminalId", "cols", "rows"],
    summary: "Resize a terminal PTY viewport",
  },
  "kill-terminal": {
    tool: "kill_terminal",
    positionals: ["terminalId"],
    summary: "Signal a terminal session",
  },
  "close-terminal": {
    tool: "close_terminal",
    positionals: ["terminalId"],
    summary: "Kill and forget a terminal session",
  },
  "terminal-snapshot": {
    tool: "get_terminal_snapshot",
    positionals: ["terminalId"],
    summary: "Print terminal metadata and scrollback",
  },
  "dev-servers": {
    tool: "list_dev_servers",
    positionals: [],
    summary: "List managed dev servers and their status/port",
  },
  "start-dev": {
    tool: "start_dev_server",
    positionals: ["cwd", "command"],
    summary: "Start a dev server: start-dev <cwd> <command> [--args ...]",
  },
  "stop-dev": {
    tool: "stop_dev_server",
    positionals: ["devServerId"],
    summary: "Stop a managed dev server by id",
  },

  // Settings, storage, and plugins.
  settings: {
    tool: "get_app_settings",
    positionals: [],
    summary: "Read global app settings",
  },
  "set-settings": {
    tool: "set_app_settings",
    positionals: [],
    summary: "Patch global app settings (--settings-json)",
  },
  storage: {
    tool: "storage_list_collections",
    positionals: [],
    summary: "List durable storage collections",
  },
  "storage-read": {
    tool: "storage_read_collection",
    positionals: ["name"],
    summary: "Read a durable storage collection",
  },
  "storage-export": {
    tool: "storage_export_state",
    positionals: [],
    summary: "Export persisted state and storage metadata",
  },
  plugins: {
    tool: "list_plugins",
    positionals: [],
    summary: "List installed plugins and grants",
  },
  "install-plugin": {
    tool: "install_plugin",
    positionals: [],
    summary: "Install a plugin (--directory, --archive, or --devUrl)",
  },
  "approve-plugin": {
    tool: "approve_plugin_grants",
    positionals: ["pluginId"],
    summary: "Approve plugin grants (--capabilities/--apis)",
    arrayFlags: ["capabilities", "apis"],
  },
  "enable-plugin": {
    tool: "set_plugin_enabled",
    positionals: ["pluginId", "enabled"],
    summary: "Enable or disable an installed plugin",
  },
  "uninstall-plugin": {
    tool: "uninstall_plugin",
    positionals: ["pluginId"],
    summary: "Uninstall a plugin",
  },
  "open-plugin": {
    tool: "open_plugin_tab",
    positionals: ["pluginId"],
    summary: "Open an enabled plugin in a plugin tab",
  },
};

/** Normalize command-specific params after generic flag/positional parsing. */
export function normalizeCommandParams(
  spec: CommandSpec,
  params: Record<string, unknown>,
): Record<string, unknown> {
  if (!spec.arrayFlags?.length) return params;
  const next = { ...params };
  for (const key of spec.arrayFlags) {
    if (next[key] !== undefined && !Array.isArray(next[key])) next[key] = [next[key]];
  }
  return next;
}

export function listCommands(): string {
  return Object.entries(commands)
    .map(([name, spec]) => `  ${name.padEnd(16)} ${spec.summary}`)
    .join("\n");
}
