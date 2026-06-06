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
  screenshot: {
    tool: "take_screenshot",
    positionals: ["tabId"],
    summary: "Capture a screenshot of a browser tab (placeholder)",
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
  processes: {
    tool: "get_process_tree",
    positionals: [],
    summary: "List managed child processes (placeholder)",
  },
  "process-logs": {
    tool: "get_process_logs",
    positionals: ["processId"],
    summary: "Print captured logs for a managed process",
  },
};

export function listCommands(): string {
  return Object.entries(commands)
    .map(([name, spec]) => `  ${name.padEnd(16)} ${spec.summary}`)
    .join("\n");
}
