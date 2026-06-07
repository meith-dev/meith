import { type ToolDefinition, defineTool } from "@meith/protocol";
import { ToolError } from "@meith/shared";
import { z } from "zod";
import {
  type ControlContext,
  TabClaimRequiredError,
  TabOwnershipError,
} from "../services/BrowserTabService.js";
import type { ToolDeps } from "./deps.js";

/**
 * Callers that must claim a tab (via `browser_use_start`) before mutating it.
 * Multiple agents/plugins can run concurrently, so automated browser control
 * is exclusive. Interactive callers (`renderer`, `cli`) and first-party
 * `internal` orchestration may control unclaimed tabs directly.
 */
const AUTOMATION_CALLERS = new Set<string>(["agent", "plugin"]);

/**
 * Run a service call, mapping ownership conflicts and missing-claim errors to
 * the `PERMISSION_DENIED` tool error code.
 */
async function guardOwnership<T>(fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof TabOwnershipError) {
      throw new ToolError("PERMISSION_DENIED", err.message, {
        tabId: err.tabId,
        ownerId: err.ownerId,
      });
    }
    if (err instanceof TabClaimRequiredError) {
      throw new ToolError("PERMISSION_DENIED", err.message, {
        tabId: err.tabId,
        reason: "claim_required",
      });
    }
    throw err;
  }
}

/** Resolve the automation owner for a control call. */
function ownerOf(ctx: { sessionId?: string; caller: string }, explicit?: string): string {
  return explicit ?? ctx.sessionId ?? ctx.caller;
}

/** Build the control context (owner + whether a prior claim is enforced). */
function controlFor(
  ctx: { sessionId?: string; caller: string },
  explicit?: string,
): ControlContext {
  return {
    ownerId: ownerOf(ctx, explicit),
    requireClaim: AUTOMATION_CALLERS.has(ctx.caller),
  };
}

/**
 * Tools that operate on the browser/workspace tab model and the live browser
 * views behind them. Tab metadata lives in persistent app state; live views
 * live in the injected `BrowserViewHost`.
 */
export function createBrowserTools(deps: ToolDeps): ToolDefinition[] {
  const getTabs = defineTool({
    name: "get_tabs",
    description: "List browser tabs and workspace tabs, optionally filtered by space.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      spaceId: z.string().optional().describe("Filter to a single space id."),
    }),
    execute: (_ctx, input) => ({
      browserTabs: deps.browserTabs.listBrowserTabs(input.spaceId),
      workspaceTabs: deps.browserTabs.listWorkspaceTabs(input.spaceId),
    }),
  });

  const getActiveTab = defineTool({
    name: "get_active_tab",
    description: "Return the active browser tab for a space (or the active space).",
    capabilities: ["read-only"],
    inputSchema: z.object({ spaceId: z.string().optional() }),
    execute: (_ctx, input) => deps.browserTabs.getActiveBrowserTab(input.spaceId),
  });

  const openBrowserTab = defineTool({
    name: "open_browser_tab",
    description: "Open a new browser tab pointing at a URL and focus it.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({
      url: z.string().describe("URL to open, e.g. http://localhost:3000"),
      title: z.string().optional(),
      spaceId: z.string().optional(),
      cwd: z.string().optional().describe("Optional associated project cwd."),
    }),
    execute: (_ctx, input) => deps.browserTabs.openBrowserTab(input),
  });

  const navigate = defineTool({
    name: "navigate",
    description: "Navigate an existing browser tab to a new URL.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({
      tabId: z.string(),
      url: z.string(),
      owner: z.string().optional().describe("Automation owner id, if claimed."),
    }),
    execute: (ctx, input) =>
      guardOwnership(() =>
        deps.browserTabs.navigate(input.tabId, input.url, controlFor(ctx, input.owner)),
      ),
  });

  const goBack = defineTool({
    name: "go_back",
    description: "Navigate a browser tab back in its history.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({ tabId: z.string(), owner: z.string().optional() }),
    execute: (ctx, input) =>
      guardOwnership(() =>
        deps.browserTabs.goBack(input.tabId, controlFor(ctx, input.owner)),
      ),
  });

  const goForward = defineTool({
    name: "go_forward",
    description: "Navigate a browser tab forward in its history.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({ tabId: z.string(), owner: z.string().optional() }),
    execute: (ctx, input) =>
      guardOwnership(() =>
        deps.browserTabs.goForward(input.tabId, controlFor(ctx, input.owner)),
      ),
  });

  const refresh = defineTool({
    name: "refresh",
    description: "Reload a browser tab.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({ tabId: z.string(), owner: z.string().optional() }),
    execute: (ctx, input) =>
      guardOwnership(() =>
        deps.browserTabs.refresh(input.tabId, ownerOf(ctx, input.owner)),
      ),
  });

  const focusBrowserTab = defineTool({
    name: "focus_browser_tab",
    description: "Make a browser tab the active/visible tab in its space.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({ tabId: z.string() }),
    execute: (_ctx, input) => deps.browserTabs.focusBrowserTab(input.tabId),
  });

  const closeBrowserTab = defineTool({
    name: "close_browser_tab",
    description: "Close a browser tab and destroy its live view.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({ tabId: z.string(), owner: z.string().optional() }),
    execute: (ctx, input) =>
      guardOwnership(async () => ({
        closed: await deps.browserTabs.closeBrowserTab(
          input.tabId,
          ownerOf(ctx, input.owner),
        ),
      })),
  });

  const browserUseStart = defineTool({
    name: "browser_use_start",
    description:
      "Claim exclusive automation control of a browser tab. Prevents other agents/tools from controlling it concurrently.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({
      tabId: z.string(),
      owner: z.string().optional().describe("Owner id; defaults to the session id."),
    }),
    execute: (ctx, input) =>
      guardOwnership(() =>
        deps.browserTabs.startUse(input.tabId, ownerOf(ctx, input.owner)),
      ),
  });

  const browserUseEnd = defineTool({
    name: "browser_use_end",
    description: "Release automation control of a browser tab.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({
      tabId: z.string(),
      owner: z.string().optional(),
      force: z.boolean().optional().describe("Release even if owned by another id."),
    }),
    execute: (ctx, input) =>
      guardOwnership(() =>
        deps.browserTabs.endUse(
          input.tabId,
          ownerOf(ctx, input.owner),
          input.force ?? false,
        ),
      ),
  });

  const takeScreenshot = defineTool({
    name: "take_screenshot",
    description:
      "Capture a screenshot of a browser tab using the live view. Persists a PNG artifact when storage is available.",
    capabilities: ["controls-browser", "read-only"],
    inputSchema: z.object({ tabId: z.string() }),
    execute: async (_ctx, input) => {
      try {
        return await deps.browserTabs.captureScreenshot(input.tabId);
      } catch (err) {
        throw new ToolError(
          "TOOL_FAILED",
          err instanceof Error ? err.message : String(err),
        );
      }
    },
  });

  return [
    getTabs,
    getActiveTab,
    openBrowserTab,
    navigate,
    goBack,
    goForward,
    refresh,
    focusBrowserTab,
    closeBrowserTab,
    browserUseStart,
    browserUseEnd,
    takeScreenshot,
  ];
}
