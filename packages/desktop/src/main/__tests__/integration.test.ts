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
    expect(names).toContain("set_workspace_tab_terminal");
    expect(names).toContain("focus_workspace_tab");
    expect(names).toContain("close_workspace_tab");
    const closeSpace = tools.find((t) => t.name === "close_space");
    expect(closeSpace?.capabilities).toContain("destructive");

    // Phase 6 terminal + dev-server + process-inspection tools are registered.
    expect(names).toContain("create_terminal");
    expect(names).toContain("write_terminal");
    expect(names).toContain("kill_terminal");
    expect(names).toContain("list_terminals");
    expect(names).toContain("start_dev_server");
    expect(names).toContain("stop_dev_server");
    expect(names).toContain("list_dev_servers");
    expect(names).toContain("get_process_tree");
    expect(names).toContain("get_process_logs");
    expect(names).toContain("attach_process_logs");
    const createTerminal = tools.find((t) => t.name === "create_terminal");
    expect(createTerminal?.capabilities).toContain("starts-process");

    // Phase 7 project management tools are registered.
    expect(names).toContain("project_list");
    expect(names).toContain("project_detect");
    expect(names).toContain("project_open");
    expect(names).toContain("project_start_dev_server");
    expect(names).toContain("project_stop_dev_server");
    expect(names).toContain("project_list_templates");
    expect(names).toContain("project_create");
    expect(names).toContain("project_create_plugin");
    expect(names).toContain("project_allocate");
    const projectOpen = tools.find((t) => t.name === "project_open");
    expect(projectOpen?.capabilities).toContain("writes-files");
  });

  it("detects and opens a project over the socket", async () => {
    // Detect this package directory: has a package.json with scripts, no throw.
    const detected = await client.callTool("project_detect", { cwd: process.cwd() });
    expect(detected.ok).toBe(true);
    const detection = detected.content as {
      hasPackageJson: boolean;
      scripts: { name: string }[];
    };
    expect(detection.hasPackageJson).toBe(true);

    const opened = await client.callTool("project_open", { cwd: process.cwd() });
    expect(opened.ok).toBe(true);
    const project = (opened.content as { project: { id: string; cwd: string } }).project;
    expect(project.id).toMatch(/^proj_/);

    const list = await client.callTool("project_list", {});
    const projects = (list.content as { projects: { id: string }[] }).projects;
    expect(projects.some((p) => p.id === project.id)).toBe(true);
  });

  it("lists templates including the app and plugin scaffolds", async () => {
    const result = await client.callTool("project_list_templates", {});
    expect(result.ok).toBe(true);
    const templates = (result.content as { templates: { name: string; kind: string }[] })
      .templates;
    expect(templates.some((t) => t.name === "app-basic" && t.kind === "app")).toBe(true);
    expect(templates.some((t) => t.name === "plugin-basic" && t.kind === "plugin")).toBe(
      true,
    );
  });

  it("creates a new project from a template without opening it", async () => {
    const result = await client.callTool("project_create", {
      template: "app-basic",
      name: "socket-created-app",
      open: false,
    });
    expect(result.ok).toBe(true);
    const created = result.content as { cwd: string; project: unknown };
    expect(created.cwd.startsWith(generatedRoot)).toBe(true);
    expect(created.cwd).toContain("socket-created-app");
    expect(created.project).toBeNull();
  });

  it("creates a terminal and lists it over the socket", async () => {
    const created = await client.callTool("create_terminal", { cwd: "/tmp" });
    expect(created.ok).toBe(true);
    const term = created.content as { id: string; status: string };
    expect(term.id).toMatch(/^term_/);
    expect(term.status).toBe("running");

    const list = await client.callTool("list_terminals", {});
    const sessions = list.content as { id: string }[];
    expect(sessions.some((t) => t.id === term.id)).toBe(true);

    // Clean up so the session doesn't outlive the test.
    const killed = await client.callTool("kill_terminal", { terminalId: term.id });
    expect(killed.ok).toBe(true);
  });

  it("closes the backing terminal when a terminal workspace tab is closed", async () => {
    const created = await client.callTool("create_terminal", { cwd: process.cwd() });
    expect(created.ok).toBe(true);
    const terminalId = (created.content as { id: string }).id;

    const opened = await client.callTool("open_workspace_tab", {
      title: "Terminal",
      cwd: process.cwd(),
      kind: "terminal",
      terminalId,
    });
    expect(opened.ok).toBe(true);
    const tabId = (opened.content as { id: string }).id;

    const closed = await client.callTool("close_workspace_tab", { tabId });
    expect(closed.ok).toBe(true);

    const terminals = await client.callTool("list_terminals", {});
    expect(terminals.ok).toBe(true);
    expect((terminals.content as { id: string }[]).some((t) => t.id === terminalId)).toBe(
      false,
    );
  });

  it("reports get_process_tree as a structured (non-stub) list", async () => {
    const result = await client.callTool("get_process_tree", {});
    expect(result.ok).toBe(true);
    const content = result.content as { processes: unknown[] };
    expect(Array.isArray(content.processes)).toBe(true);
  });

  it("calls app_get_state and gets a valid AppState in result.content", async () => {
    const result = await client.callTool("app_get_state", {});
    expect(result.ok).toBe(true);
    const state = result.content as { version: number; browserTabs: unknown[] };
    expect(state.version).toBe(3);
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

  it("downgrades a client-claimed privileged caller to cli", async () => {
    // Register a tool on the live container registry that echoes the caller the
    // registry actually saw (i.e. after the socket identity policy ran).
    const { defineTool } = await import("@meith/protocol");
    const { z } = await import("zod");
    container.registry.register(
      defineTool({
        name: "__echo_caller",
        description: "test-only: returns the resolved caller",
        inputSchema: z.object({}),
        execute: (ctx) => ({ caller: ctx.caller }),
      }),
    );

    // A socket peer that lies and claims the privileged in-process `agent`
    // identity must be downgraded to `cli`.
    const claimedAgent = (await sendRawFrame(container.config.socketPath, {
      type: "tool_call",
      requestId: "req_caller_agent",
      toolName: "__echo_caller",
      arguments: {},
      clientInfo: { caller: "agent" },
    })) as { type: string; result?: { ok: boolean; content?: { caller: string } } };
    expect(claimedAgent.type).toBe("tool_result");
    expect(claimedAgent.result?.content?.caller).toBe("cli");

    // A legitimately allowed caller (`plugin`) is preserved.
    const claimedPlugin = (await sendRawFrame(container.config.socketPath, {
      type: "tool_call",
      requestId: "req_caller_plugin",
      toolName: "__echo_caller",
      arguments: {},
      clientInfo: { caller: "plugin" },
    })) as { type: string; result?: { ok: boolean; content?: { caller: string } } };
    expect(claimedPlugin.result?.content?.caller).toBe("plugin");
  });

  it("prevents a socket peer from hijacking another owner's claimed tab", async () => {
    // The persistent `client` connection opens and claims a tab. Its owner id
    // is the server-assigned connection id, surfaced on the tab record.
    const opened = await client.callTool("open_browser_tab", {
      url: "https://owner.test",
    });
    const tabId = (opened.content as { id: string }).id;
    const claim = await client.callTool("browser_use_start", { tabId });
    expect(claim.ok).toBe(true);
    const realOwnerId = (claim.content as { ownerId: string | null }).ownerId;
    expect(realOwnerId).toBeTruthy();

    // A DIFFERENT socket connection (each sendRawFrame opens its own) tries to
    // navigate the claimed tab while spoofing every client-controlled value it
    // could: the victim's exact owner id (in args), a matching sessionId, and a
    // privileged caller. All are ignored; ownership is bound to the trusted
    // per-connection id, so this is denied.
    const hijackNav = (await sendRawFrame(container.config.socketPath, {
      type: "tool_call",
      requestId: "req_hijack_nav",
      toolName: "navigate",
      arguments: { tabId, url: "https://evil.test", owner: realOwnerId },
      clientInfo: { caller: "agent", sessionId: realOwnerId },
    })) as { result?: { ok: boolean; error?: { code: string } } };
    expect(hijackNav.result?.ok).toBe(false);
    expect(hijackNav.result?.error?.code).toBe("PERMISSION_DENIED");

    // Forcing a release of someone else's tab is reserved for internal cleanup;
    // a socket peer (downgraded to `cli`) cannot use `force` even with the
    // victim's owner id.
    const hijackEnd = (await sendRawFrame(container.config.socketPath, {
      type: "tool_call",
      requestId: "req_hijack_end",
      toolName: "browser_use_end",
      arguments: { tabId, owner: realOwnerId, force: true },
      clientInfo: { caller: "agent", sessionId: realOwnerId },
    })) as { result?: { ok: boolean; error?: { code: string } } };
    expect(hijackEnd.result?.ok).toBe(false);
    expect(hijackEnd.result?.error?.code).toBe("PERMISSION_DENIED");

    // The tab is still claimed by the original owner — neither attack mutated it.
    const tabs = await client.callTool("get_tabs", {});
    const tab = (
      tabs.content as {
        browserTabs: { id: string; ownerId: string | null; url: string }[];
      }
    ).browserTabs.find((t) => t.id === tabId);
    expect(tab?.ownerId).toBe(realOwnerId);
    expect(tab?.url).toBe("https://owner.test");
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
    expect(snapshot.stateVersion).toBe(3);
    expect(snapshot.state.version).toBe(3);
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
      const started = await client.callTool("start_dev_server", {
        cwd: process.cwd(),
        command: process.execPath,
        args: ["-e", "console.log('ready'); setInterval(() => {}, 1000)"],
      });
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

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}
