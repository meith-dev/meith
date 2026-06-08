import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolClient } from "@meith/cli/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ServiceContainer, bootstrap } from "../bootstrap.js";

/**
 * Send a single raw ndjson frame and resolve with the first server frame.
 * Bypasses ToolClient so we can craft an out-of-range `protocol` value.
 */
function sendRawFrame(
  socketPath: string,
  frame: Record<string, unknown>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath, () => {
      socket.write(`${JSON.stringify(frame)}\n`);
    });
    let buffer = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      const nl = buffer.indexOf("\n");
      if (nl >= 0) {
        const line = buffer.slice(0, nl).trim();
        socket.end();
        try {
          resolve(JSON.parse(line));
        } catch (err) {
          reject(err);
        }
      }
    });
    socket.on("error", reject);
  });
}

/**
 * Full integration path WITHOUT Electron:
 *   bootstrap services -> socket server listens -> CLI ToolClient connects ->
 *   list + call tools over the real Unix socket, exercising the ToolResult
 *   envelope, capability metadata, streaming events, and shutdown behavior.
 */
describe("socket integration", () => {
  let container: ServiceContainer;
  let home: string;
  let userData: string;
  let client: ToolClient;

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "meith-home-"));
    userData = mkdtempSync(join(tmpdir(), "meith-data-"));
    process.env.MEITH_HOME = home;
    container = await bootstrap(userData);
    client = new ToolClient({ socketPath: container.config.socketPath });
    await client.connect();
  });

  afterAll(async () => {
    client.close();
    await container.shutdown();
    rmSync(home, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
    process.env.MEITH_HOME = undefined;
  });

  it("lists the registered tools with capability metadata", async () => {
    const tools = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("get_tabs");
    expect(names).toContain("open_browser_tab");
    expect(names).toContain("app_get_state");
    expect(names).toContain("app_get_logs");

    const getTabs = tools.find((t) => t.name === "get_tabs");
    expect(getTabs?.capabilities).toContain("read-only");
    const openTab = tools.find((t) => t.name === "open_browser_tab");
    expect(openTab?.capabilities).toContain("controls-browser");

    // Phase 4 automation/diagnostics tools are registered.
    expect(names).toContain("get_browser_state");
    expect(names).toContain("click_element");
    expect(names).toContain("type_text");
    expect(names).toContain("cdp_command");
    expect(names).toContain("get_console_logs");
    expect(names).toContain("get_network_logs");
    const clickEl = tools.find((t) => t.name === "click_element");
    expect(clickEl?.capabilities).toContain("controls-browser");

    // Phase 5 space + workspace-tab management tools are registered.
    expect(names).toContain("create_space");
    expect(names).toContain("switch_space");
    expect(names).toContain("update_space");
    expect(names).toContain("close_space");
    expect(names).toContain("open_workspace_tab");
    expect(names).toContain("focus_workspace_tab");
    expect(names).toContain("close_workspace_tab");
    const closeSpace = tools.find((t) => t.name === "close_space");
    expect(closeSpace?.capabilities).toContain("destructive");
  });

  it("calls app_get_state and gets a valid AppState in result.content", async () => {
    const result = await client.callTool("app_get_state", {});
    expect(result.ok).toBe(true);
    const state = result.content as { version: number; browserTabs: unknown[] };
    expect(state.version).toBe(2);
    expect(Array.isArray(state.browserTabs)).toBe(true);
  });

  it("opens a browser tab and sees it reflected in get_tabs", async () => {
    const opened = await client.callTool("open_browser_tab", {
      url: "http://localhost:3000",
      title: "Dev",
    });
    expect(opened.ok).toBe(true);
    const tab = opened.content as { id: string };
    expect(tab.id).toMatch(/^btab_/);

    const tabs = await client.callTool("get_tabs", {});
    const list = (tabs.content as { browserTabs: { id: string }[] }).browserTabs;
    expect(list.some((t) => t.id === tab.id)).toBe(true);
  });

  it("captures a real screenshot artifact for a tab", async () => {
    const opened = await client.callTool("open_browser_tab", {
      url: "http://localhost:3000",
    });
    const tab = opened.content as { id: string };
    const result = await client.callTool("take_screenshot", { tabId: tab.id });
    expect(result.ok).toBe(true);
    const shot = result.content as { tabId: string; path?: string };
    expect(shot.tabId).toBe(tab.id);
    expect(typeof shot.path).toBe("string");
  });

  it("extracts browser state and interacts via the socket tools", async () => {
    const opened = await client.callTool("open_browser_tab", {
      url: "http://localhost:3000/app",
    });
    const tab = opened.content as { id: string };

    const state = await client.callTool("get_browser_state", { tabId: tab.id });
    expect(state.ok).toBe(true);
    const elements = (state.content as { elements: { id: string; tag: string }[] })
      .elements;
    expect(elements.length).toBeGreaterThan(0);
    const input = elements.find((e) => e.tag === "input");
    expect(input).toBeTruthy();

    const typed = await client.callTool("type_text", {
      tabId: tab.id,
      elementId: input?.id,
      text: "query",
    });
    expect(typed.ok).toBe(true);

    const after = await client.callTool("get_browser_state", { tabId: tab.id });
    const inputAfter = (
      after.content as { elements: { tag: string; value?: string }[] }
    ).elements.find((e) => e.tag === "input");
    expect(inputAfter?.value).toBe("query");
  });

  it("surfaces an unknown element id as a TOOL_FAILED error", async () => {
    const opened = await client.callTool("open_browser_tab", {
      url: "http://localhost:3000/app2",
    });
    const tab = opened.content as { id: string };
    const result = await client.callTool("click_element", {
      tabId: tab.id,
      elementId: "el-9999",
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TOOL_FAILED");
  });

  it("reads console and network diagnostics over the socket", async () => {
    const opened = await client.callTool("open_browser_tab", {
      url: "http://localhost:3000/diag",
    });
    const tab = opened.content as { id: string };

    const console = await client.callTool("get_console_logs", { tabId: tab.id });
    expect(console.ok).toBe(true);
    expect(Array.isArray(console.content)).toBe(true);

    const network = await client.callTool("get_network_logs", { tabId: tab.id });
    expect(network.ok).toBe(true);
    const entries = network.content as { url: string }[];
    expect(entries.some((e) => e.url.includes("/diag"))).toBe(true);
  });

  it("runs a raw CDP command via cdp_command", async () => {
    const opened = await client.callTool("open_browser_tab", {
      url: "http://localhost:3000/cdp",
    });
    const tab = opened.content as { id: string };
    const result = await client.callTool("cdp_command", {
      tabId: tab.id,
      method: "Runtime.evaluate",
      params: { expression: "1+1" },
    });
    expect(result.ok).toBe(true);
    const content = result.content as { method: string };
    expect(content.method).toBe("Runtime.evaluate");
  });

  it("rejects a mismatched protocol version without executing the tool", async () => {
    // A unique marker URL: if the tool ran, it would appear in get_tabs.
    const markerUrl = "http://localhost:3000/__proto999__";
    const response = (await sendRawFrame(container.config.socketPath, {
      type: "tool_call",
      protocol: 999,
      requestId: "req_proto_mismatch",
      toolName: "open_browser_tab",
      arguments: { url: markerUrl },
      clientInfo: { caller: "cli" },
    })) as { type: string; code?: string; requestId?: string };

    // The server must answer with a transport-level PROTOCOL_ERROR...
    expect(response.type).toBe("error");
    expect(response.code).toBe("PROTOCOL_ERROR");
    expect(response.requestId).toBe("req_proto_mismatch");

    // ...and the tool must NOT have executed: no tab with the marker URL.
    const tabs = await client.callTool("get_tabs", {});
    const list = (tabs.content as { browserTabs: { url: string }[] }).browserTabs;
    expect(list.some((t) => t.url === markerUrl)).toBe(false);
  });

  it("reports an unknown tool as a structured error (not a throw)", async () => {
    const result = await client.callTool("does_not_exist", {});
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("UNKNOWN_TOOL");
  });

  it("reports invalid arguments as a VALIDATION_ERROR", async () => {
    // open_browser_tab requires a string `url`.
    const result = await client.callTool("open_browser_tab", { url: 123 });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("lists storage collections via storage_list_collections", async () => {
    const result = await client.callTool("storage_list_collections", {});
    expect(result.ok).toBe(true);
    const content = result.content as {
      dataDirectory: string;
      collections: { name: string; kind: string }[];
    };
    const names = content.collections.map((c) => c.name);
    expect(names).toContain("state");
    expect(names).toContain("logs");
  });

  it("reads the logs collection from disk", async () => {
    const result = await client.callTool("storage_read_collection", {
      name: "logs",
      limit: 5,
    });
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.content)).toBe(true);
  });

  it("errors clearly on an unknown collection", async () => {
    const result = await client.callTool("storage_read_collection", { name: "nope" });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("VALIDATION_ERROR");
  });

  it("exports a full state snapshot with storage metadata", async () => {
    const result = await client.callTool("storage_export_state", {});
    expect(result.ok).toBe(true);
    const snapshot = result.content as {
      stateVersion: number;
      dataDirectory: string;
      state: { version: number };
    };
    expect(snapshot.stateVersion).toBe(2);
    expect(snapshot.state.version).toBe(2);
  });
});

describe("registry cross-cutting behavior", () => {
  it("enforces a per-call timeout", async () => {
    const { ToolRegistry } = await import("../tools/registry.js");
    const { defineTool } = await import("@meith/protocol");
    const { z } = await import("zod");

    const registry = new ToolRegistry();
    registry.register(
      defineTool({
        name: "slow",
        description: "never resolves",
        inputSchema: z.object({}),
        execute: () => new Promise(() => {}),
      }),
    );

    const result = await registry.call(
      { cwd: process.cwd(), caller: "internal" },
      "slow",
      {},
      { timeoutMs: 25 },
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("TIMEOUT");
  });

  it("supports cancellation via an AbortSignal", async () => {
    const { ToolRegistry } = await import("../tools/registry.js");
    const { defineTool } = await import("@meith/protocol");
    const { z } = await import("zod");

    const registry = new ToolRegistry();
    registry.register(
      defineTool({
        name: "waity",
        description: "waits for abort",
        inputSchema: z.object({}),
        execute: (ctx) =>
          new Promise((_resolve, reject) => {
            ctx.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      }),
    );

    const controller = new AbortController();
    const promise = registry.call(
      { cwd: process.cwd(), caller: "internal" },
      "waity",
      {},
      { signal: controller.signal },
    );
    controller.abort();
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("CANCELLED");
  });

  it("rejects calls after beginShutdown", async () => {
    const { ToolRegistry } = await import("../tools/registry.js");
    const registry = new ToolRegistry();
    registry.beginShutdown();
    const result = await registry.call(
      { cwd: process.cwd(), caller: "internal" },
      "anything",
      {},
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("RUNTIME_SHUTTING_DOWN");
  });
});
