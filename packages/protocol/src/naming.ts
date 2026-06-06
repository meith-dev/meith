/**
 * Naming conventions:
 *  - Tool names are snake_case  (e.g. `open_browser_tab`)
 *  - CLI commands are kebab-case (e.g. `open-browser-tab`)
 *
 * These helpers are the single source of truth for converting between them so
 * the CLI and any tests agree.
 */

export function commandToToolName(command: string): string {
  return command.trim().toLowerCase().replace(/-/g, "_");
}

export function toolNameToCommand(toolName: string): string {
  return toolName.trim().toLowerCase().replace(/_/g, "-");
}
