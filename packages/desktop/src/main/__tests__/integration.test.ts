import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolClient } from "@meith/cli/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ServiceContainer, bootstrap } from "../bootstrap.js";

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
  });

  it("calls app_get_state and gets a valid AppState in result.content", async () => {
    const result = await client.callTool("app_get_state", {});
    expect(result.ok).toBe(true);
    const state = result.content as { version: number; browserTabs: unknown[] };
    expect(state.version).toBe(1);
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

  it("returns a placeholder tool result with a diagnostic", async () => {
    const result = await client.callTool("take_screenshot", {});
    expect(result.ok).toBe(true);
    expect(result.diagnostics?.[0]?.level).toBe("warn");
    expect((result.content as { placeholder: boolean }).placeholder).toBe(true);
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
    expect(snapshot.stateVersion).toBe(1);
    expect(snapshot.state.version).toBe(1);
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
