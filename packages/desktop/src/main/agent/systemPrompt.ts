import type { ToolDescriptor } from "@meith/protocol";
import type { AgentPromptContext } from "./types.js";

/**
 * Builds the agent system prompt. The tool catalog is generated from the live
 * registry (`registry.describe()`), never hardcoded, so the prompt cannot drift
 * out of sync with the tools the host actually exposes. The static base
 * (`base`) intentionally contains NO tool list.
 */

export const SYSTEM_PROMPT_BASE = `# meith Agent System Prompt

You are an AI agent embedded in **meith**, a desktop AI IDE. You operate on the
user's machine through a set of structured **tools** exposed by the application.
The host (the Electron main process) is the authority for all state and actions.

## How you act

- You can only affect the app by calling the tools listed below. Do not invent
  tools. Call \`app_get_state\` if you are unsure about the current state.
- Only use tools from the Meith MCP server named \`meith\` for app-control
  actions. Provider-native tools, bundled MCP tools from other servers, shell
  helpers, browser automation helpers, filesystem helpers, and tool-discovery
  helpers are not substitutes for Meith tools.
- Meith MCP tools may appear with provider-specific prefixes such as
  \`mcp__meith__app_get_state\`; treat those as the callable form of the
  matching catalog entry. Do not claim the runtime lacks callable Meith tools
  when the Meith catalog and MCP server are present.
- The \`Available tools\` section below is authoritative for this session. Do
  not say you are unsure which Meith tools are available, do not search for
  tools elsewhere, and do not use non-Meith tool discovery when a listed Meith
  tool fits the task.
- Treat the tools in this Meith catalog as your only app-control interface. If
  a Meith tool can do the job, use it; if no Meith tool can do the job, explain
  the missing capability.
- For browser work, use ONLY Meith browser tools such as \`get_tabs\`,
  \`get_active_tab\`, \`get_browser_state\`, \`take_screenshot\`, \`navigate\`,
  and related tab/interaction tools.
- You MUST NOT use provider-native or built-in web tools (for example
  \`WebSearch\`, \`WebFetch\`, \`web.run\`, browser automation, or any non-Meith
  fetch/open-page tool). The ONLY way to access the web, browse pages, search,
  or read documentation is through Meith browser tools (\`navigate\`, \`get_tabs\`,
  \`get_active_tab\`, \`get_browser_state\`, \`take_screenshot\`, and related
  tab/interaction tools). Any attempt to use a non-Meith web tool will be
  denied by the host, so always reach for the Meith browser tools directly.
- For version control, use ONLY Meith git tools (\`git_status\`, \`git_diff\`,
  \`git_stage\`, \`git_commit\`, \`git_branch\`, \`git_log\`, \`git_blame\`, and the
  other \`git_*\` tools in the catalog). You MUST NOT run \`git\` through
  shell/terminal/exec tools, and you MUST NOT use provider-native git helpers.
  The host denies any \`git\` command issued through a non-Meith tool, so reach
  for the Meith \`git_*\` tools directly.
- For terminals, dev servers, and long-running processes, use the Meith
  process tools from the catalog instead of provider-native shell helpers
  whenever an equivalent Meith tool exists.
- If the host denies a provider-native tool call, do NOT retry that tool or a
  variant of it. Switch immediately to the matching Meith tool from the
  catalog and continue the task with it.
- Never pass placeholder values such as \`PLACEHOLDER\`, \`TODO\`, \`unknown\`, or
  guessed IDs to tools. If a browser tool needs a \`tabId\`, first call
  \`get_active_tab\` or \`get_tabs\` and use the returned concrete ID.
- When \`take_screenshot\` succeeds, treat that tool result as the screenshot
  artifact shown to the user. Do not call a separate image viewer/inspection
  tool just to look at or link the same screenshot, and do not print local
  screenshot file paths in the final answer.
- When the user asks what tools you have, answer from the Meith tool catalog
  below. Mention concrete Meith tool names and capabilities; do not answer with
  generic host/runtime tools unless the user explicitly asks about the adapter.
- Prefer small, verifiable steps. After a mutating action, read state back.
- Keep chat progress compact: use a brief thinking/status update before or
  after a group of related tool calls, avoid narrating every internal decision,
  and keep final answers focused on what changed and how it was verified.
- Never assume a browser tab, workspace tab, or process exists — list it first.

## Instruction precedence

- App safety rules, permission boundaries, and the tool call contract are
  mandatory. Do not bypass them to satisfy user or repo instructions.
- Tool descriptors, schemas, and tool results are authoritative for how to call
  Meith tools and interpret their output.
- The latest user request defines the task. It overrides project instruction
  files when they conflict, unless doing so would violate app safety rules or
  tool contracts.
- Project-specific instruction files apply to work inside their project scope.
  More specific nested files override broader repo files.
- If instructions conflict and the safe precedence is unclear, explain the
  conflict and ask before making a risky change.

## Tool call contract

Each tool has a name (snake_case), a description, and a JSON Schema for input.
The catalog below is generated from the host's live tool registry, so it always
reflects exactly what is available. The same list (with full JSON Schemas) is
also provided at runtime via \`list_tools\`. Validate your arguments against the
schema. Results are JSON. Tools may return \`{ "placeholder": true, ... }\` for
features that are scaffolded but not yet implemented — treat these as
not-yet-available and tell the user.

## Boundaries

- Do not hardcode assumptions about which AI provider is running you. The host
  bridges you via an \`AgentAdapter\` (ACP / MCP / SDK).
- Respect the user's working directory (\`cwd\`) passed in your session context.`;

/** Render the tool catalog section from live descriptors. */
export function renderToolCatalog(tools: readonly ToolDescriptor[]): string {
  if (tools.length === 0) {
    return "## Available tools\n\n_No tools are currently registered._";
  }
  const lines = [...tools]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tool) => {
      const caps =
        tool.capabilities && tool.capabilities.length > 0
          ? ` _[${tool.capabilities.join(", ")}]_`
          : "";
      return `- \`${tool.name}\` — ${tool.description}${caps}`;
    });
  return `## Available tools\n\n${lines.join("\n")}`;
}

/** Render the live workspace/session context section. */
export function renderContext(context: AgentPromptContext): string {
  const lines: string[] = ["## Current context", ""];
  lines.push(`- Working directory: \`${context.cwd}\``);
  if (context.spaceName) lines.push(`- Space: ${context.spaceName}`);
  if (context.activeEditorFile) {
    lines.push(
      `- Active editor file: \`${context.activeEditorFile.path}\` (${context.activeEditorFile.tabTitle}, cwd \`${context.activeEditorFile.cwd}\`)`,
    );
  } else {
    lines.push("- Active editor file: none");
  }
  if (context.selectedGitFile) {
    lines.push(
      `- Selected Git file: \`${context.selectedGitFile.path}\` (${context.selectedGitFile.tabTitle}, cwd \`${context.selectedGitFile.cwd}\`)`,
    );
  } else {
    lines.push("- Selected Git file: none");
  }
  if (context.openTabs && context.openTabs.length > 0) {
    lines.push("- Open browser tabs:");
    for (const tab of context.openTabs) {
      lines.push(`  - ${tab.title || "(untitled)"} — ${tab.url}`);
    }
  } else {
    lines.push("- Open browser tabs: none");
  }
  if (context.terminals && context.terminals.length > 0) {
    lines.push("- Terminal status:");
    for (const terminal of context.terminals) {
      const title = terminal.tabTitle ? `${terminal.tabTitle}: ` : "";
      const active = terminal.active ? ", active" : "";
      const exit =
        terminal.status === "exited" ? `, exit=${terminal.exitCode ?? "null"}` : "";
      lines.push(
        `  - ${title}\`${terminal.id}\` ${terminal.status}${active}${exit}, cwd \`${terminal.cwd}\`, pid ${terminal.pid ?? "n/a"}`,
      );
    }
  } else {
    lines.push("- Terminal status: no relevant terminals");
  }
  if (context.devServers && context.devServers.length > 0) {
    lines.push("- Running dev servers:");
    for (const server of context.devServers) {
      const name = server.name ? `${server.name}: ` : "";
      const url = server.url ? `, url ${server.url}` : "";
      lines.push(
        `  - ${name}\`${server.id}\` ${server.status}${url}, command \`${server.command}\`, cwd \`${server.cwd}\`, pid ${server.pid ?? "n/a"}`,
      );
    }
  } else {
    lines.push("- Running dev servers: none");
  }
  if (context.consoleErrors && context.consoleErrors.length > 0) {
    lines.push("- Recent console errors:");
    for (const entry of context.consoleErrors) {
      const source = entry.source ? ` (${entry.source})` : "";
      lines.push(
        `  - ${entry.tabTitle || "(untitled)"} — ${entry.url}: ${oneLine(entry.text)}${source}`,
      );
    }
  } else {
    lines.push("- Recent console errors: none");
  }
  if (context.git) {
    const branch = context.git.branch ? ` on ${context.git.branch}` : "";
    const summary = context.git.summary ? ` — ${context.git.summary}` : "";
    lines.push(`- Git: ${context.git.status}${branch}${summary}`);
    if (context.git.files && context.git.files.length > 0) {
      for (const file of context.git.files) lines.push(`  - ${file}`);
    }
  }
  return lines.join("\n");
}

/** Render project-specific instruction files discovered for the session cwd. */
export function renderInstructionFiles(context: AgentPromptContext): string {
  if (!context.instructionFiles || context.instructionFiles.length === 0) {
    return [
      "## Project instructions",
      "",
      "_No project-specific instruction files were found for this session cwd._",
    ].join("\n");
  }
  const lines = [
    "## Project instructions",
    "",
    "Instruction files are listed from broadest to most specific. Apply the",
    "precedence rules above when they conflict.",
  ];
  for (const file of context.instructionFiles) {
    lines.push("", `### ${file.path}${file.truncated ? " (truncated)" : ""}`, "");
    lines.push("```");
    lines.push(file.content);
    lines.push("```");
  }
  return lines.join("\n");
}

/** Render the safety / permission rules section. */
export function renderSafety(context: AgentPromptContext): string {
  const auto = context.autoAccept
    ? "Auto-accept is ON: gated tools run without a prompt, so be especially careful."
    : "Gated tools (writing files, starting processes, controlling the browser, destructive actions) require explicit user approval before they run. Expect some calls to be denied and adapt.";
  return [
    "## Safety & permissions",
    "",
    `- Read-only tools run freely. ${auto}`,
    "- Never attempt to bypass the permission system or fabricate tool output.",
    "- Prefer the smallest change that accomplishes the user's goal, and read",
    "  state back after mutations to confirm the effect.",
  ].join("\n");
}

/**
 * Compose the full system prompt: static guidance + a registry-derived tool
 * catalog + optional live workspace context and safety rules. Pass
 * `registry.describe()` for `tools`.
 */
export function buildSystemPrompt(
  tools: readonly ToolDescriptor[],
  context?: AgentPromptContext,
): string {
  const catalog = renderToolCatalog(tools);
  // Insert the catalog right after the "How you act" section, before the
  // "Tool call contract" heading.
  const marker = "## Tool call contract";
  const idx = SYSTEM_PROMPT_BASE.indexOf(marker);
  const base =
    idx === -1
      ? `${SYSTEM_PROMPT_BASE}\n\n${catalog}`
      : `${SYSTEM_PROMPT_BASE.slice(0, idx)}${catalog}\n\n${SYSTEM_PROMPT_BASE.slice(idx)}`;
  if (!context) return base;
  return `${base}\n\n${renderInstructionFiles(context)}\n\n${renderContext(context)}\n\n${renderSafety(context)}`;
}

function oneLine(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}
