/**
 * Declarative mapping from a friendly kebab-case CLI command to a runtime tool
 * name (snake_case) plus the ordered positional argument slots that feed its
 * params. The generic `call <toolName>` escape hatch can reach any tool.
 */
export interface CommandSpec {
  tool: string;
  positionals: string[];
  summary: string;
}

export const commands: Record<string, CommandSpec> = {
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
  screenshot: {
    tool: "take_screenshot",
    positionals: ["tabId"],
    summary: "Capture a screenshot of a browser tab",
  },
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
  "bug-report": {
    tool: "app_export_bug_report",
    positionals: [],
    summary: "Export a reproducible bug report artifact",
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
};

export function listCommands(): string {
  return Object.entries(commands)
    .map(([name, spec]) => `  ${name.padEnd(16)} ${spec.summary}`)
    .join("\n");
}
