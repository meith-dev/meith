import type { ToolDescriptor } from "@meith/protocol";

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
- Prefer small, verifiable steps. After a mutating action, read state back.
- Never assume a browser tab, workspace tab, or process exists — list it first.

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

/**
 * Compose the full system prompt: static guidance + a registry-derived tool
 * catalog. Pass `registry.describe()` for `tools`.
 */
export function buildSystemPrompt(tools: readonly ToolDescriptor[]): string {
  const catalog = renderToolCatalog(tools);
  // Insert the catalog right after the "How you act" section, before the
  // "Tool call contract" heading.
  const marker = "## Tool call contract";
  const idx = SYSTEM_PROMPT_BASE.indexOf(marker);
  if (idx === -1) return `${SYSTEM_PROMPT_BASE}\n\n${catalog}`;
  return `${SYSTEM_PROMPT_BASE.slice(0, idx)}${catalog}\n\n${SYSTEM_PROMPT_BASE.slice(idx)}`;
}
