import { type ToolDefinition, defineTool } from "@meith/protocol";
import { z } from "zod";
import type { ToolDeps } from "./deps.js";

/**
 * Space (workspace grouping) and workspace-tab management tools. These back the
 * production renderer shell, but — like every tool — are equally callable from
 * the CLI and future agents through the single registry.
 */
export function createSpaceTools(deps: ToolDeps): ToolDefinition[] {
  const listSpaces = defineTool({
    name: "list_spaces",
    description: "List all spaces and the active space id.",
    capabilities: ["read-only"],
    inputSchema: z.object({}),
    execute: () => ({
      spaces: deps.spaces.list(),
      activeSpaceId: deps.spaces.getActiveSpaceId(),
    }),
  });

  const createSpace = defineTool({
    name: "create_space",
    description: "Create a new space and make it active.",
    capabilities: ["writes-files"],
    inputSchema: z.object({
      name: z.string().min(1),
      color: z.string().optional(),
    }),
    execute: (_ctx, input) => deps.spaces.create(input),
  });

  const updateSpace = defineTool({
    name: "update_space",
    description: "Rename and/or recolor a space.",
    capabilities: ["writes-files"],
    inputSchema: z.object({
      spaceId: z.string(),
      name: z.string().min(1).optional(),
      color: z.string().optional(),
    }),
    execute: (_ctx, input) =>
      deps.spaces.update(input.spaceId, { name: input.name, color: input.color }),
  });

  const switchSpace = defineTool({
    name: "switch_space",
    description: "Switch the active space.",
    capabilities: ["writes-files"],
    inputSchema: z.object({ spaceId: z.string() }),
    execute: (_ctx, input) => deps.spaces.switchTo(input.spaceId),
  });

  const closeSpace = defineTool({
    name: "close_space",
    description: "Close (archive) a space and its tabs. The last space cannot be closed.",
    capabilities: ["destructive"],
    inputSchema: z.object({ spaceId: z.string() }),
    execute: async (_ctx, input) => ({ closed: await deps.spaces.close(input.spaceId) }),
  });

  const openWorkspaceTab = defineTool({
    name: "open_workspace_tab",
    description:
      "Open a workspace tab (editor/terminal/agent/preview/git) in the active space.",
    capabilities: ["writes-files"],
    inputSchema: z.object({
      title: z.string().min(1),
      cwd: z.string().min(1),
      kind: z.enum(["editor", "terminal", "agent", "preview", "git"]).optional(),
      spaceId: z.string().optional(),
      terminalId: z.string().optional(),
      selectedGitFilePath: z.string().optional(),
    }),
    execute: (_ctx, input) => deps.browserTabs.openWorkspaceTab(input),
  });

  const setWorkspaceTabTerminal = defineTool({
    name: "set_workspace_tab_terminal",
    description: "Associate a terminal workspace tab with its live terminal session.",
    capabilities: ["writes-files"],
    inputSchema: z.object({
      tabId: z.string(),
      terminalId: z.string().nullable(),
    }),
    execute: (_ctx, input) =>
      deps.browserTabs.setWorkspaceTabTerminal(input.tabId, input.terminalId),
  });

  const setWorkspaceTabFile = defineTool({
    name: "set_workspace_tab_file",
    description:
      "Set file-focused workspace tab state: editor focused/open files or git selected file (paths relative to cwd).",
    capabilities: ["writes-files"],
    inputSchema: z.object({
      tabId: z.string(),
      activeFilePath: z.string().nullable().optional(),
      openFilePaths: z.array(z.string()).optional(),
      selectedGitFilePath: z.string().nullable().optional(),
    }),
    execute: (_ctx, input) =>
      deps.browserTabs.setWorkspaceTabFile(input.tabId, {
        activeFilePath: input.activeFilePath,
        openFilePaths: input.openFilePaths,
        selectedGitFilePath: input.selectedGitFilePath,
      }),
  });

  const focusWorkspaceTab = defineTool({
    name: "focus_workspace_tab",
    description: "Make a workspace tab the active one in its space.",
    capabilities: ["writes-files"],
    inputSchema: z.object({ tabId: z.string() }),
    execute: (_ctx, input) => deps.browserTabs.focusWorkspaceTab(input.tabId),
  });

  const closeWorkspaceTab = defineTool({
    name: "close_workspace_tab",
    description: "Close a workspace tab.",
    // Destructive: closing a terminal tab also tears down its live terminal
    // session (deps.terminals.close below), killing any running process. This
    // must be gated so an agent/plugin is prompted for approval first rather
    // than silently killing a terminal.
    capabilities: ["destructive"],
    inputSchema: z.object({ tabId: z.string() }),
    execute: (_ctx, input) => {
      const tab = deps.browserTabs
        .listWorkspaceTabs()
        .find((candidate) => candidate.id === input.tabId);
      if (tab?.kind === "terminal" && tab.terminalId) {
        deps.terminals.close(tab.terminalId);
      }
      return { closed: deps.browserTabs.closeWorkspaceTab(input.tabId) };
    },
  });

  return [
    listSpaces,
    createSpace,
    updateSpace,
    switchSpace,
    closeSpace,
    openWorkspaceTab,
    setWorkspaceTabTerminal,
    setWorkspaceTabFile,
    focusWorkspaceTab,
    closeWorkspaceTab,
  ];
}
