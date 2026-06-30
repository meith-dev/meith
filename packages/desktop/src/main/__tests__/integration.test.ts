import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolClient } from "@meith/cli/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ServiceContainer, bootstrap } from "../bootstrap.js";
import { CURRENT_STATE_VERSION } from "../storage/migrations.js";

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

describe("socket integration", () => {
  let container: ServiceContainer;
  let home: string;
  let userData: string;
  let generatedRoot: string;
  let client: ToolClient;

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "meith-home-"));
    userData = mkdtempSync(join(tmpdir(), "meith-data-"));
    generatedRoot = mkdtempSync(join(tmpdir(), "meith-generated-"));
    process.env.MEITH_HOME = home;
    container = await bootstrap(userData, { generatedProjectsRoot: generatedRoot });
    client = new ToolClient({ socketPath: container.config.socketPath });
    await client.connect();
  });

  afterAll(async () => {
    client.close();
    await container.shutdown();
    rmSync(home, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
    rmSync(generatedRoot, { recursive: true, force: true });
    process.env.MEITH_HOME = undefined;
  });

  it("lists registered tools with capability metadata", async () => {
    const tools = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("get_tabs");
    expect(names).toContain("open_browser_tab");
    expect(names).toContain("create_terminal");
    expect(names).toContain("project_create");
    expect(names).toContain("storage_read_collection");
    expect(names).toContain("app_health");
    expect(names).toContain("app_export_bug_report");
    expect(tools.find((t) => t.name === "get_tabs")?.capabilities).toContain("read-only");
    expect(tools.find((t) => t.name === "open_browser_tab")?.capabilities).toContain(
      "controls-browser",
    );
    expect(tools.find((t) => t.name === "create_terminal")?.capabilities).toContain(
      "starts-process",
    );
    expect(tools.find((t) => t.name === "project_create")?.capabilities).toContain(
      "writes-files",
    );
  });

  it("allows read-only project and storage tools over the socket", async () => {
    const detected = await client.callTool("project_detect", { cwd: process.cwd() });
    expect(detected.ok).toBe(true);
    expect((detected.content as { hasPackageJson: boolean }).hasPackageJson).toBe(true);

    const templates = await client.callTool("project_list_templates", {});
    expect(templates.ok).toBe(true);
    expect(
      (templates.content as { templates: { name: string }[] }).templates.some(
        (t) => t.name === "app-basic",
      ),
    ).toBe(true);

    const collections = await client.callTool("storage_list_collections", {});
    expect(collections.ok).toBe(true);
    const names = (
      collections.content as { collections: { name: string }[] }
    ).collections.map((c) => c.name);
    expect(names).toContain("state");
    expect(names).toContain("logs");
    expect(names).toContain("audit");
  });

  it("denies privileged socket calls without an explicit session grant", async () => {
    for (const [toolName, args] of [
      ["project_open", { cwd: process.cwd() }],
      ["project_create", { template: "app-basic", name: "blocked", open: false }],
      ["create_terminal", { cwd: process.cwd() }],
      ["open_browser_tab", { url: "http://localhost:3000" }],
    ] as const) {
      const result = await client.callTool(toolName, args);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("PERMISSION_DENIED");
    }
  });

  it("keeps privileged behavior available to trusted internal callers", async () => {
    const internal = { cwd: process.cwd(), caller: "internal" as const };
    const term = await container.registry.call(internal, "create_terminal", {
      cwd: process.cwd(),
    });
    expect(term.ok).toBe(true);
    const terminalId = (term.content as { id: string }).id;

    const opened = await container.registry.call(internal, "open_workspace_tab", {
      title: "Terminal",
      cwd: process.cwd(),
      kind: "terminal",
      terminalId,
    });
    expect(opened.ok).toBe(true);

    const closed = await container.registry.call(internal, "close_workspace_tab", {
      tabId: (opened.content as { id: string }).id,
    });
    expect(closed.ok).toBe(true);

    const terminals = await client.callTool("list_terminals", {});
    expect(terminals.ok).toBe(true);
    expect((terminals.content as { id: string }[]).some((t) => t.id === terminalId)).toBe(
      false,
    );
  });

  it("denies browser automation and CDP over the socket", async () => {
    const opened = await container.registry.call(
      { cwd: process.cwd(), caller: "internal" },
      "open_browser_tab",
      { url: "http://localhost:3000/app" },
    );
    expect(opened.ok).toBe(true);
    const tabId = (opened.content as { id: string }).id;

    for (const [toolName, args] of [
      ["get_browser_state", { tabId }],
      ["take_screenshot", { tabId }],
      ["type_text", { tabId, elementId: "el-1", text: "query" }],
      ["click_element", { tabId, elementId: "el-9999" }],
      [
        "cdp_command",
        { tabId, method: "Runtime.evaluate", params: { expression: "1+1" } },
      ],
    ] as const) {
      const result = await client.callTool(toolName, args);
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("PERMISSION_DENIED");
    }
  });

  it("allows read-only browser diagnostics over the socket", async () => {
    const opened = await container.registry.call(
      { cwd: process.cwd(), caller: "internal" },
      "open_browser_tab",
      { url: "http://localhost:3000/diag" },
    );
    expect(opened.ok).toBe(true);
    const tabId = (opened.content as { id: string }).id;

    const console = await client.callTool("get_console_logs", { tabId });
    expect(console.ok).toBe(true);
    expect(Array.isArray(console.content)).toBe(true);

    const network = await client.callTool("get_network_logs", { tabId });
    expect(network.ok).toBe(true);
    expect(
      (network.content as { url: string }[]).some((e) => e.url.includes("/diag")),
    ).toBe(true);
  });

  it("audits denied privileged socket calls", async () => {
    const denied = await client.callTool("project_create", {
      template: "app-basic",
      name: "audit-denied-app",
      open: false,
    });
    expect(denied.error?.code).toBe("PERMISSION_DENIED");

    const audit = await client.callTool("storage_read_collection", {
      name: "audit",
      limit: 20,
    });
    expect(audit.ok).toBe(true);
    const entries = audit.content as { toolName: string; decision: string }[];
    expect(
      entries.some((e) => e.toolName === "project_create" && e.decision === "deny"),
    ).toBe(true);
  });

  it("rejects a mismatched protocol version without executing the tool", async () => {
    const markerUrl = "http://localhost:3000/__proto999__";
    const response = (await sendRawFrame(container.config.socketPath, {
      type: "tool_call",
      protocol: 999,
      requestId: "req_proto_mismatch",
      toolName: "open_browser_tab",
      arguments: { url: markerUrl },
      clientInfo: { caller: "cli" },
    })) as { type: string; code?: string; requestId?: string };

    expect(response.type).toBe("error");
    expect(response.code).toBe("PROTOCOL_ERROR");
    expect(response.requestId).toBe("req_proto_mismatch");

    const tabs = await client.callTool("get_tabs", {});
    const list = (tabs.content as { browserTabs: { url: string }[] }).browserTabs;
    expect(list.some((t) => t.url === markerUrl)).toBe(false);
  });

  it("downgrades a client-claimed privileged caller to cli", async () => {
    const { defineTool } = await import("@meith/protocol");
    const { z } = await import("zod");
    container.registry.register(
      defineTool({
        name: "__echo_caller",
        description: "test-only: returns the resolved caller",
        capabilities: ["read-only"],
        inputSchema: z.object({}),
        execute: (ctx) => ({ caller: ctx.caller }),
      }),
    );

    const claimedAgent = (await sendRawFrame(container.config.socketPath, {
      type: "tool_call",
      requestId: "req_caller_agent",
      toolName: "__echo_caller",
      arguments: {},
      clientInfo: { caller: "agent" },
    })) as { type: string; result?: { ok: boolean; content?: { caller: string } } };
    expect(claimedAgent.type).toBe("tool_result");
    expect(claimedAgent.result?.content?.caller).toBe("cli");

    const claimedPlugin = (await sendRawFrame(container.config.socketPath, {
      type: "tool_call",
      requestId: "req_caller_plugin",
      toolName: "__echo_caller",
      arguments: {},
      clientInfo: { caller: "plugin" },
    })) as { type: string; result?: { ok: boolean; content?: { caller: string } } };
    expect(claimedPlugin.result?.content?.caller).toBe("plugin");
  });

  it("prevents a socket peer from controlling an internally claimed tab", async () => {
    const internal = { cwd: process.cwd(), caller: "internal" as const };
    const opened = await container.registry.call(internal, "open_browser_tab", {
      url: "https://owner.test",
    });
    expect(opened.ok).toBe(true);
    const tabId = (opened.content as { id: string }).id;
    const claim = await container.registry.call(
      { ...internal, sessionId: "internal-owner" },
      "browser_use_start",
      { tabId },
    );
    expect(claim.ok).toBe(true);
    const ownerId = (claim.content as { ownerId: string | null }).ownerId;
    expect(ownerId).toBe("internal-owner");

    const hijack = (await sendRawFrame(container.config.socketPath, {
      type: "tool_call",
      requestId: "req_hijack_nav",
      toolName: "navigate",
      arguments: { tabId, url: "https://evil.test", owner: ownerId },
      clientInfo: { caller: "agent", sessionId: ownerId },
    })) as { result?: { ok: boolean; error?: { code: string } } };
    expect(hijack.result?.ok).toBe(false);
    expect(hijack.result?.error?.code).toBe("PERMISSION_DENIED");

    const tabs = await client.callTool("get_tabs", {});
    const tab = (
      tabs.content as {
        browserTabs: { id: string; ownerId: string | null; url: string }[];
      }
    ).browserTabs.find((t) => t.id === tabId);
    expect(tab?.ownerId).toBe(ownerId);
    expect(tab?.url).toBe("https://owner.test");
  });

  it("reports stable structured errors", async () => {
    const unknown = await client.callTool("does_not_exist", {});
    expect(unknown.ok).toBe(false);
    expect(unknown.error?.code).toBe("UNKNOWN_TOOL");

    const invalid = await client.callTool("open_browser_tab", { url: 123 });
    expect(invalid.ok).toBe(false);
    expect(invalid.error?.code).toBe("VALIDATION_ERROR");

    const badCollection = await client.callTool("storage_read_collection", {
      name: "nope",
    });
    expect(badCollection.ok).toBe(false);
    expect(badCollection.error?.code).toBe("VALIDATION_ERROR");
  });

  it("exports a full state snapshot with storage metadata", async () => {
    const result = await client.callTool("storage_export_state", {});
    expect(result.ok).toBe(true);
    const snapshot = result.content as {
      stateVersion: number;
      dataDirectory: string;
      state: { version: number };
    };
    expect(snapshot.stateVersion).toBe(CURRENT_STATE_VERSION);
    expect(snapshot.state.version).toBe(CURRENT_STATE_VERSION);
  });

  it("returns app health and live instances over the socket", async () => {
    const health = await client.callTool("app_health", {});
    expect(health.ok).toBe(true);
    const healthContent = health.content as {
      status: string;
      checks: { name: string; status: string }[];
    };
    expect(healthContent.status).toBe("ok");
    expect(healthContent.checks.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "socket",
        "browser_view_service",
        "dev_server_service",
        "terminal_service",
        "agent_runtime",
        "storage",
      ]),
    );

    const instances = await client.callTool("app_list_instances", {});
    expect(instances.ok).toBe(true);
    expect(
      (instances.content as { instances: { pid: number }[] }).instances.some(
        (i) => i.pid === process.pid,
      ),
    ).toBe(true);
  });

  it("filters structured app logs by tool metadata", async () => {
    const requestId = "req_log_filter";
    await sendRawFrame(container.config.socketPath, {
      type: "tool_call",
      requestId,
      toolName: "app_health",
      arguments: {},
      clientInfo: { caller: "cli" },
    });

    const result = await client.callTool("app_get_logs", {
      toolName: "app_health",
      search: requestId,
      limit: 20,
    });
    expect(result.ok).toBe(true);
    const entries = result.content as { toolName?: string; correlationId?: string }[];
    expect(entries.some((e) => e.toolName === "app_health")).toBe(true);
    expect(entries.some((e) => e.correlationId === requestId)).toBe(true);
  });

  it("exports a reproducible bug report artifact", async () => {
    const result = await client.callTool("app_export_bug_report", { logsLimit: 20 });
    expect(result.ok).toBe(true);
    const content = result.content as {
      path?: string;
      report: {
        schema: string;
        stateSummary: { version: number };
        logs: unknown[];
        toolRegistry: { name: string }[];
      };
    };
    expect(content.path).toBeTruthy();
    expect(content.report.schema).toBe("meith-bug-report/v1");
    expect(content.report.stateSummary.version).toBe(CURRENT_STATE_VERSION);
    expect(content.report.toolRegistry.some((t) => t.name === "app_health")).toBe(true);
  });
});

describe("socket shutdown", () => {
  it("aborts attached log streams and closes sockets during shutdown", async () => {
    const home = mkdtempSync(join(tmpdir(), "meith-home-"));
    const userData = mkdtempSync(join(tmpdir(), "meith-data-"));
    const generatedRoot = mkdtempSync(join(tmpdir(), "meith-generated-"));
    process.env.MEITH_HOME = home;

    const container = await bootstrap(userData, { generatedProjectsRoot: generatedRoot });
    const client = new ToolClient({ socketPath: container.config.socketPath });
    await client.connect();

    try {
      const started = await container.registry.call(
        { cwd: process.cwd(), caller: "internal" },
        "start_dev_server",
        {
          cwd: process.cwd(),
          command: process.execPath,
          args: ["-e", "console.log('ready'); setInterval(() => {}, 1000)"],
        },
      );
      expect(started.ok).toBe(true);
      const devServerId = (started.content as { id: string }).id;

      const events: string[] = [];
      const attached = client.callTool(
        "attach_process_logs",
        { devServerId, replay: true },
        {
          timeoutMs: 0,
          onEvent: (event) => {
            if (event.kind === "log" && event.message) events.push(event.message);
          },
        },
      );
      attached.catch(() => undefined);
      await waitFor(() => events.some((line) => line.includes("ready")));

      await Promise.race([
        container.shutdown(),
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error("shutdown timed out")), 1000),
        ),
      ]);
    } finally {
      client.close();
      await container.shutdown();
      rmSync(home, { recursive: true, force: true });
      rmSync(userData, { recursive: true, force: true });
      rmSync(generatedRoot, { recursive: true, force: true });
      process.env.MEITH_HOME = undefined;
    }
  });
});

describe("registry cross-cutting behavior", () => {
  it("enforces a per-call timeout", async () => {
    const { defineTool } = await import("@meith/protocol");
    const { z } = await import("zod");
    const { ToolRegistry } = await import("../tools/registry.js");

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
    const { defineTool } = await import("@meith/protocol");
    const { z } = await import("zod");
    const { ToolRegistry } = await import("../tools/registry.js");

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

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}
