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

/**
 * Resolve the automation owner for a control call from TRUSTED SERVER CONTEXT
 * ONLY. `sessionId` is assigned by the host — the socket server stamps a
 * per-connection id and `AgentService` stamps the agent session id — so it can
 * never be forged by a socket peer. We intentionally do NOT accept a
 * client-supplied `owner`, which would let one caller impersonate another and
 * hijack a claimed tab.
 */
function ownerOf(ctx: { sessionId?: string; caller: string }): string {
  return ctx.sessionId ?? ctx.caller;
}

/** Build the control context (owner + whether a prior claim is enforced). */
function controlFor(ctx: { sessionId?: string; caller: string }): ControlContext {
  return {
    ownerId: ownerOf(ctx),
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
    }),
    execute: (ctx, input) =>
      guardOwnership(() =>
        deps.browserTabs.navigate(input.tabId, input.url, controlFor(ctx)),
      ),
  });

  const goBack = defineTool({
    name: "go_back",
    description: "Navigate a browser tab back in its history.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({ tabId: z.string() }),
    execute: (ctx, input) =>
      guardOwnership(() => deps.browserTabs.goBack(input.tabId, controlFor(ctx))),
  });

  const goForward = defineTool({
    name: "go_forward",
    description: "Navigate a browser tab forward in its history.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({ tabId: z.string() }),
    execute: (ctx, input) =>
      guardOwnership(() => deps.browserTabs.goForward(input.tabId, controlFor(ctx))),
  });

  const refresh = defineTool({
    name: "refresh",
    description: "Reload a browser tab.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({ tabId: z.string() }),
    execute: (ctx, input) =>
      guardOwnership(() => deps.browserTabs.refresh(input.tabId, controlFor(ctx))),
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
    inputSchema: z.object({ tabId: z.string() }),
    execute: (ctx, input) =>
      guardOwnership(async () => ({
        closed: await deps.browserTabs.closeBrowserTab(input.tabId, controlFor(ctx)),
      })),
  });

  const browserUseStart = defineTool({
    name: "browser_use_start",
    description:
      "Claim exclusive automation control of a browser tab. Prevents other agents/tools from controlling it concurrently.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({ tabId: z.string() }),
    execute: (ctx, input) =>
      guardOwnership(() => deps.browserTabs.startUse(input.tabId, ownerOf(ctx))),
  });

  const browserUseEnd = defineTool({
    name: "browser_use_end",
    description: "Release automation control of a browser tab.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({ tabId: z.string() }),
    execute: (ctx, input) =>
      guardOwnership(() =>
        // `force` (release a tab owned by someone else) is reserved for
        // first-party `internal` cleanup. External callers can only release
        // tabs they themselves own.
        deps.browserTabs.endUse(input.tabId, ownerOf(ctx), ctx.caller === "internal"),
      ),
  });

  const getBrowserState = defineTool({
    name: "get_browser_state",
    description:
      "Extract a browser tab's interactable elements (with stable ids), plus url/title/viewport. Use the returned element ids with click_element and type_text.",
    capabilities: ["read-only", "controls-browser"],
    inputSchema: z.object({ tabId: z.string() }),
    execute: (_ctx, input) => deps.browserTabs.getBrowserState(input.tabId),
  });

  const clickElement = defineTool({
    name: "click_element",
    description: "Click an element by an id from the latest get_browser_state.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({
      tabId: z.string(),
      elementId: z.string().describe("Element id from get_browser_state, e.g. el-2."),
    }),
    execute: (ctx, input) =>
      guardOwnership(async () => {
        await deps.browserTabs.clickElement(
          input.tabId,
          input.elementId,
          controlFor(ctx),
        );
        return { clicked: input.elementId };
      }),
  });

  const typeText = defineTool({
    name: "type_text",
    description:
      "Focus an element (by get_browser_state id) and type text, replacing its current value.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({
      tabId: z.string(),
      elementId: z.string(),
      text: z.string(),
    }),
    execute: (ctx, input) =>
      guardOwnership(async () => {
        await deps.browserTabs.typeText(
          input.tabId,
          input.elementId,
          input.text,
          controlFor(ctx),
        );
        return { typed: input.text.length };
      }),
  });

  const scrollPage = defineTool({
    name: "scroll_page",
    description:
      "Scroll a browser tab by a relative delta (deltaX/deltaY) or to an absolute position (toX/toY).",
    capabilities: ["controls-browser"],
    inputSchema: z.object({
      tabId: z.string(),
      deltaX: z.number().optional(),
      deltaY: z.number().optional(),
      toX: z.number().optional(),
      toY: z.number().optional(),
    }),
    execute: (ctx, input) =>
      guardOwnership(async () => {
        await deps.browserTabs.scrollPage(
          input.tabId,
          { deltaX: input.deltaX, deltaY: input.deltaY, toX: input.toX, toY: input.toY },
          controlFor(ctx),
        );
        return { ok: true };
      }),
  });

  const sendKeys = defineTool({
    name: "send_keys",
    description:
      "Dispatch keyboard input to the focused element/page. Use a named key (Enter, Tab, Backspace, ArrowDown, ...) or literal characters.",
    capabilities: ["controls-browser"],
    inputSchema: z.object({
      tabId: z.string(),
      keys: z.string(),
    }),
    execute: (ctx, input) =>
      guardOwnership(async () => {
        await deps.browserTabs.sendKeys(input.tabId, input.keys, controlFor(ctx));
        return { ok: true };
      }),
  });

  const cdpCommand = defineTool({
    name: "cdp_command",
    description:
      "Issue a raw Chrome DevTools Protocol command against a tab (e.g. Page.navigate, Runtime.evaluate). Treated as browser control.",
    capabilities: ["controls-browser", "accesses-network"],
    inputSchema: z.object({
      tabId: z.string(),
      method: z.string().describe("CDP method, e.g. Runtime.evaluate."),
      params: z.record(z.unknown()).optional(),
    }),
    execute: (ctx, input) =>
      guardOwnership(() =>
        deps.browserTabs.cdpCommand(
          input.tabId,
          input.method,
          input.params ?? {},
          controlFor(ctx),
        ),
      ),
  });

  const getConsoleLogs = defineTool({
    name: "get_console_logs",
    description: "Return console messages captured for a browser tab (most recent last).",
    capabilities: ["read-only"],
    inputSchema: z.object({
      tabId: z.string(),
      limit: z.number().int().positive().optional(),
    }),
    execute: (_ctx, input) => deps.browserTabs.getConsoleLogs(input.tabId, input.limit),
  });

  const getNetworkLogs = defineTool({
    name: "get_network_logs",
    description: "Return network requests observed for a browser tab (most recent last).",
    capabilities: ["read-only", "accesses-network"],
    inputSchema: z.object({
      tabId: z.string(),
      limit: z.number().int().positive().optional(),
    }),
    execute: (_ctx, input) => deps.browserTabs.getNetworkLogs(input.tabId, input.limit),
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
    getBrowserState,
    clickElement,
    typeText,
    scrollPage,
    sendKeys,
    cdpCommand,
    getConsoleLogs,
    getNetworkLogs,
  ];
}
