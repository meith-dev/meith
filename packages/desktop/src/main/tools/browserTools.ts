import { z } from "zod";
import { defineTool, type ToolDefinition } from "@aide/protocol";
import type { ToolDeps } from "./deps.js";

/**
 * Tools that operate on the browser/workspace tab model.
 */
export function createBrowserTools(deps: ToolDeps): ToolDefinition[] {
  const getTabs = defineTool({
    name: "get_tabs",
    description:
      "List browser tabs and workspace tabs, optionally filtered by space.",
    inputSchema: z.object({
      spaceId: z.string().optional().describe("Filter to a single space id."),
    }),
    execute: (_ctx, input) => ({
      browserTabs: deps.browserTabs.listBrowserTabs(input.spaceId),
      workspaceTabs: deps.browserTabs.listWorkspaceTabs(input.spaceId),
    }),
  });

  const openBrowserTab = defineTool({
    name: "open_browser_tab",
    description:
      "Open a new browser tab pointing at a URL. Becomes a WebContentsView later.",
    inputSchema: z.object({
      url: z.string().describe("URL to open, e.g. http://localhost:3000"),
      title: z.string().optional(),
      spaceId: z.string().optional(),
      cwd: z.string().optional().describe("Optional associated project cwd."),
    }),
    execute: (_ctx, input) => deps.browserTabs.openBrowserTab(input),
  });

  const takeScreenshot = defineTool({
    name: "take_screenshot",
    description:
      "[placeholder] Capture a screenshot of a browser tab. Returns a stub until WebContentsView capture is implemented.",
    inputSchema: z.object({
      tabId: z.string().optional(),
    }),
    execute: (_ctx, input) => ({
      ok: false,
      placeholder: true,
      message:
        "take_screenshot is not implemented yet. Will use webContents.capturePage().",
      tabId: input.tabId ?? null,
    }),
  });

  return [getTabs, openBrowserTab, takeScreenshot];
}
