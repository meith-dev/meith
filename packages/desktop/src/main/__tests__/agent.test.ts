import { readFileSync, statSync } from "node:fs";
import { defineTool } from "@meith/protocol";
import type { ToolResult } from "@meith/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { JsonRpcClient } from "../agent/acp/JsonRpcClient.js";
import {
  applyConfigOptions,
  buildAcpPrompt,
  extractMeithToolCallId,
  mapSessionUpdate,
  parseAcpConfigOptions,
  selectAcpPermissionOption,
  shouldWaitForMcpToolsExposure,
  supportsHttpMcp,
  waitForMcpToolsExposed,
} from "../agent/adapters/AcpAdapter.js";
import { buildSystemPrompt, renderToolCatalog } from "../agent/systemPrompt.js";
import type { AgentAdapter, AgentSession, AgentStreamChunk } from "../agent/types.js";
import { AgentConfigStore } from "../services/AgentConfigStore.js";
import { AgentService } from "../services/AgentService.js";
import { AppStateService } from "../services/AppStateService.js";
import { Logger } from "../services/Logger.js";
import { ToolRegistry } from "../tools/registry.js";

describe("system prompt builder", () => {
  const tools = [
    defineTool({
      name: "open_browser_tab",
      description: "open a URL",
      inputSchema: z.object({ url: z.string() }),
      capabilities: ["controls-browser"],
      execute: () => ({}),
    }),
    defineTool({
      name: "create_space",
      description: "create a space",
      inputSchema: z.object({ name: z.string() }),
      execute: () => ({}),
    }),
  ];

  it("renders the catalog from descriptors, sorted, with capabilities", () => {
    const reg = new ToolRegistry();
    reg.registerAll(tools);
    const catalog = renderToolCatalog(reg.describe());
    // Sorted: create_space before open_browser_tab.
    expect(catalog.indexOf("create_space")).toBeLessThan(
      catalog.indexOf("open_browser_tab"),
    );
    expect(catalog).toContain("`open_browser_tab` — open a URL");
    expect(catalog).toContain("controls-browser");
  });

  it("never contains the stale hardcoded placeholder lines", () => {
    const reg = new ToolRegistry();
    reg.registerAll(tools);
    const prompt = buildSystemPrompt(reg.describe());
    // The old prompt hardcoded these; they must now come from the registry.
    expect(prompt).not.toContain("take_screenshot* (placeholder)");
    expect(prompt).toContain("## Available tools");
    expect(prompt).toContain("## Tool call contract");
  });

  it("instructs agents to use Meith tools and answer tool questions from the catalog", () => {
    const reg = new ToolRegistry();
    reg.registerAll(tools);
    const prompt = buildSystemPrompt(reg.describe());

    expect(prompt).toContain("Treat the tools in this Meith catalog");
    expect(prompt).toContain("When the user asks what tools you have");
    expect(prompt).toContain("Available tools");
    expect(prompt).toContain("not say you are unsure");
    expect(prompt).toContain("Only use tools from the Meith MCP server");
    expect(prompt).not.toContain("does not expose callable Meith tools");
    expect(prompt).toContain("provider-specific prefixes");
    expect(prompt).toContain("matching catalog entry");
    expect(prompt).toContain("Meith catalog as your only app-control interface");
    expect(prompt).not.toContain("available host tools");
    expect(prompt).toContain("Never pass placeholder values");
    expect(prompt).toContain("`open_browser_tab`");
  });

  it("handles an empty registry gracefully", () => {
    expect(renderToolCatalog([])).toContain("No tools are currently registered");
  });

  it("renders live IDE context, instructions, and precedence rules", () => {
    const prompt = buildSystemPrompt([], {
      cwd: "/repo",
      spaceName: "Project",
      activeEditorFile: { tabTitle: "Editor", cwd: "/repo", path: "src/app.ts" },
      selectedGitFile: { tabTitle: "Git", cwd: "/repo", path: "src/app.ts" },
      openTabs: [{ title: "Local app", url: "http://localhost:3000" }],
      terminals: [
        {
          id: "term_1",
          tabTitle: "Terminal",
          cwd: "/repo",
          status: "running",
          pid: 123,
          exitCode: null,
          active: true,
        },
      ],
      devServers: [
        {
          id: "dev_1",
          cwd: "/repo",
          status: "running",
          command: "pnpm dev",
          url: "http://localhost:3000",
          pid: 456,
        },
      ],
      consoleErrors: [
        {
          tabTitle: "Local app",
          url: "http://localhost:3000",
          text: "Uncaught Error: boom",
        },
      ],
      git: {
        branch: "main",
        status: "changes",
        summary: "1 changed file(s)",
        files: ["M src/app.ts"],
      },
      instructionFiles: [
        { path: "/repo/AGENTS.md", content: "Use pnpm.", truncated: false },
      ],
    });

    expect(prompt).toContain("## Instruction precedence");
    expect(prompt).toContain("latest user request defines the task");
    expect(prompt).toContain("## Project instructions");
    expect(prompt).toContain("Use pnpm.");
    expect(prompt).toContain("Active editor file: `src/app.ts`");
    expect(prompt).toContain("Selected Git file: `src/app.ts`");
    expect(prompt).toContain("http://localhost:3000");
    expect(prompt).toContain("Uncaught Error: boom");
    expect(prompt).toContain("Git: changes on main");
  });
});

describe("ACP adapter prompt", () => {
  it("sends the Meith system prompt and tool catalog with every ACP user request", () => {
    const prompt = buildAcpPrompt(
      "Use Meith tools first.\n\n## Available tools\n\n- `get_tabs` — list tabs",
      "check the browser",
    );

    expect(prompt).toEqual([
      {
        type: "text",
        text: expect.stringContaining("Host system instructions from Meith"),
      },
    ]);
    expect(prompt[0]?.text).toContain("Use Meith tools first.");
    expect(prompt[0]?.text).toContain("`get_tabs`");
    expect(prompt[0]?.text).toContain("Current user request:\ncheck the browser");
  });

  it("includes prior session messages when building a follow-up prompt", () => {
    const prompt = buildAcpPrompt("Use Meith tools first.", [
      {
        id: "u1",
        role: "user",
        content: "check the current browser",
        createdAt: 1,
      },
      {
        id: "a1",
        role: "assistant",
        content: "I used an external browser helper.",
        createdAt: 2,
      },
      {
        id: "u2",
        role: "user",
        content: "use meith's tools only",
        createdAt: 3,
      },
      {
        id: "a2",
        role: "assistant",
        content: "",
        createdAt: 4,
      },
    ]);

    expect(prompt[0]?.text).toContain("Conversation so far:");
    expect(prompt[0]?.text).toContain("USER: check the current browser");
    expect(prompt[0]?.text).toContain("ASSISTANT: I used an external browser helper.");
    expect(prompt[0]?.text).toContain("Current user request:\nuse meith's tools only");
    expect(prompt[0]?.text).not.toContain("a2");
  });
});

describe("ACP adapter MCP exposure", () => {
  it("detects HTTP MCP support from ACP initialize responses", () => {
    expect(
      supportsHttpMcp({
        agentCapabilities: { mcpCapabilities: { http: true } },
      }),
    ).toBe(true);
    expect(
      supportsHttpMcp({
        agentCapabilities: { mcpCapabilities: { sse: true } },
      }),
    ).toBe(false);
    expect(supportsHttpMcp({})).toBe(false);
  });

  it("waits for MCP tool exposure for Codex ACP launches", () => {
    expect(
      shouldWaitForMcpToolsExposure(
        { acpPreset: "codex" },
        { command: "npx", args: ["-y", "@agentclientprotocol/codex-acp"] },
      ),
    ).toBe(true);
    expect(
      shouldWaitForMcpToolsExposure(
        { acpPreset: "custom" },
        { command: "codex-acp", args: [] },
      ),
    ).toBe(true);
    expect(
      shouldWaitForMcpToolsExposure(
        { acpPreset: "claude" },
        { command: "npx", args: ["-y", "@agentclientprotocol/claude-agent-acp"] },
      ),
    ).toBe(true);
  });

  it("fails clearly when the ACP agent never lists Meith tools", async () => {
    await expect(waitForMcpToolsExposed(new Promise(() => {}), 1)).rejects.toThrow(
      /Meith MCP tools were not exposed/,
    );
  });
});

describe("ACP adapter config and updates", () => {
  it("sets text.verbosity to low when the ACP agent advertises it", async () => {
    const calls: Array<{ method: string; params: unknown }> = [];
    const rpc = {
      request: async (method: string, params: unknown) => {
        calls.push({ method, params });
        return null;
      },
    } as unknown as JsonRpcClient;

    await applyConfigOptions(
      rpc,
      "session-1",
      parseAcpConfigOptions([
        {
          id: "text.verbosity",
          name: "Text verbosity",
          type: "select",
          currentValue: "medium",
          values: [
            { value: "low", name: "Low" },
            { value: "medium", name: "Medium" },
          ],
        },
      ]),
      {},
    );

    expect(calls).toEqual([
      {
        method: "session/set_config_option",
        params: {
          sessionId: "session-1",
          configId: "text.verbosity",
          value: "low",
        },
      },
    ]);
  });

  it("ignores phase and preamble ACP updates without surfacing them as text", () => {
    expect(
      mapSessionUpdate({
        update: { sessionUpdate: "phase", phase: "tool_calling" },
      }),
    ).toBeNull();
    expect(
      mapSessionUpdate({
        update: { sessionUpdate: "preamble", content: { text: "thinking" } },
      }),
    ).toBeNull();
  });

  it("replays assistant items as assistant text", () => {
    expect(
      mapSessionUpdate({
        update: {
          sessionUpdate: "assistant_item_replay",
          item: {
            content: [
              { type: "output_text", text: "first " },
              { type: "output_text", text: "second" },
            ],
          },
        },
      }),
    ).toEqual({ type: "text", text: "first second" });
  });
});

describe("ACP adapter permission policy", () => {
  const meithTools = new Set(["get_tabs", "navigate"]);

  it("allows permission requests for tools exposed by the Meith MCP server", () => {
    expect(
      selectAcpPermissionOption(
        {
          toolCall: { serverName: "meith", name: "get_tabs" },
          options: [
            { optionId: "deny", kind: "reject" },
            { optionId: "allow", kind: "allow_once" },
          ],
        },
        meithTools,
      ),
    ).toBe("allow");
  });

  it("allows prefixed Meith MCP tool names", () => {
    expect(
      selectAcpPermissionOption(
        {
          toolName: "mcp__meith__navigate",
          options: [
            { optionId: "no", kind: "deny" },
            { optionId: "yes", kind: "allow" },
          ],
        },
        meithTools,
      ),
    ).toBe("yes");
  });

  it("allows dotted Meith MCP display names", () => {
    expect(
      selectAcpPermissionOption(
        {
          toolName: "mcp__meith.navigate",
          options: [
            { optionId: "disallow", name: "Disallow", kind: "reject_once" },
            { optionId: "proceed", name: "Proceed", kind: "allow_once" },
          ],
        },
        meithTools,
      ),
    ).toBe("proceed");
  });

  it("tracks Codex MCP tool updates for later metadata-only approvals", () => {
    const toolCallId = extractMeithToolCallId(
      {
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call-1",
          title: "mcp.meith.get_tabs",
          status: "pending",
          rawInput: { server: "meith", tool: "get_tabs", arguments: {} },
        },
      },
      meithTools,
    );

    expect(toolCallId).toBe("call-1");
    expect(
      selectAcpPermissionOption(
        {
          toolCall: {
            toolCallId: "call-1",
            kind: "execute",
            status: "pending",
          },
          _meta: { is_mcp_tool_approval: true },
          options: [
            { optionId: "allow_once", name: "Allow", kind: "allow_once" },
            { optionId: "decline", name: "Decline", kind: "reject_once" },
          ],
        },
        meithTools,
        new Set([toolCallId ?? ""]),
      ),
    ).toBe("allow_once");
  });

  it("allows metadata-only MCP approval requests without a Meith correlation", () => {
    expect(
      selectAcpPermissionOption(
        {
          toolCall: {
            toolCallId: "external-call",
            kind: "execute",
            status: "pending",
          },
          _meta: { is_mcp_tool_approval: true },
          options: [
            { optionId: "allow_once", name: "Allow", kind: "allow_once" },
            { optionId: "decline", name: "Decline", kind: "reject_once" },
          ],
        },
        meithTools,
        new Set(["call-1"]),
      ),
    ).toBe("allow_once");
  });

  it("denies permission requests for external web/browser provider tools", () => {
    expect(
      selectAcpPermissionOption(
        {
          toolCall: { serverName: "next-devtools", name: "browser_eval" },
          options: [
            { optionId: "allow", kind: "allow_once" },
            { optionId: "deny", kind: "reject" },
          ],
        },
        meithTools,
      ),
    ).toBe("deny");
  });

  it("allows an external non-web tool request when only allow exists", () => {
    expect(
      selectAcpPermissionOption(
        {
          toolName: "shell_command",
          options: [{ optionId: "allow", kind: "allow_once" }],
        },
        meithTools,
      ),
    ).toBe("allow");
  });

  it("uses deny for external tools when no allow option is present", () => {
    expect(
      selectAcpPermissionOption(
        {
          toolName: "shell_command",
          options: [{ optionId: "deny", kind: "reject_once" }],
        },
        meithTools,
      ),
    ).toBe("deny");
  });

  it("denies web-search style tool requests from external providers", () => {
    expect(
      selectAcpPermissionOption(
        {
          toolName: "webSearch",
          toolCall: { serverName: "provider-web", name: "search_query" },
          options: [
            { optionId: "allow_once", kind: "allow_once" },
            { optionId: "decline", kind: "reject_once" },
          ],
        },
        meithTools,
      ),
    ).toBe("decline");
  });
});

describe("AgentService host context", () => {
  /** Adapter that captures the host context and the cwd a tool call ran with. */
  function makeCapturingAdapter(): {
    adapter: AgentAdapter;
    captured: {
      systemPrompt?: string;
      cwd?: string;
      caller?: string;
      sessionId?: string;
    };
  } {
    const captured: {
      systemPrompt?: string;
      cwd?: string;
      caller?: string;
      sessionId?: string;
    } = {};
    const adapter: AgentAdapter = {
      id: "test",
      displayName: "Test",
      async *run(_session, host): AsyncIterable<AgentStreamChunk> {
        captured.systemPrompt = host.systemPrompt();
        await host.callTool({ id: "call-1", name: "__probe", args: {} });
        yield { type: "done" };
      },
    };
    return { adapter, captured };
  }

  it("calls tools with session-scoped cwd, caller, and sessionId", async () => {
    const registry = new ToolRegistry();
    const seen: { cwd?: string; caller?: string; sessionId?: string } = {};
    registry.register(
      defineTool({
        name: "__probe",
        description: "captures call context",
        inputSchema: z.object({}),
        execute: (ctx) => {
          seen.cwd = ctx.cwd;
          seen.caller = ctx.caller;
          seen.sessionId = ctx.sessionId;
          return {};
        },
      }),
    );
    const service = new AgentService(registry, new Logger());
    const { adapter, captured } = makeCapturingAdapter();
    service.registerAdapter(adapter);

    const session: AgentSession = service.createSession("/tmp/project-x");
    // Drain the run stream.
    for await (const _chunk of service.run(session.id)) {
      void _chunk;
    }

    expect(seen.cwd).toBe("/tmp/project-x");
    expect(seen.caller).toBe("agent");
    expect(seen.sessionId).toBe(session.id);
    // The host exposes a registry-derived prompt to the adapter.
    expect(captured.systemPrompt).toContain("__probe");
  });

  it("builds prompt context from app state and project instruction files", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const cwd = mkdtempSync(join(tmpdir(), "meith-agent-context-"));
    writeFileSync(join(cwd, "AGENTS.md"), "Use pnpm for this project.\n", "utf8");

    const logger = new Logger();
    const appState = new AppStateService(join(cwd, "state.json"), logger, 0);
    const spaceId = appState.getState().activeSpaceId ?? appState.getState().spaces[0].id;
    appState.update((draft) => {
      draft.workspaceTabs.push(
        {
          id: "w_editor",
          spaceId,
          title: "Editor",
          cwd,
          kind: "editor",
          active: false,
          activeFilePath: "src/app.ts",
          createdAt: 1,
        },
        {
          id: "w_git",
          spaceId,
          title: "Git",
          cwd,
          kind: "git",
          active: true,
          selectedGitFilePath: "src/app.ts",
          createdAt: 2,
        },
      );
    });
    const registry = new ToolRegistry();
    registry.register(
      defineTool({
        name: "__probe",
        description: "captures call context",
        inputSchema: z.object({}),
        execute: () => ({}),
      }),
    );
    const service = new AgentService(registry, logger, { appState });
    const { adapter, captured } = makeCapturingAdapter();
    service.registerAdapter(adapter);
    const session = service.createSession({ cwd, spaceId });

    for await (const _chunk of service.run(session.id)) {
      void _chunk;
    }

    expect(captured.systemPrompt).toContain("Use pnpm for this project.");
    expect(captured.systemPrompt).toContain("Active editor file: `src/app.ts`");
    expect(captured.systemPrompt).toContain("Selected Git file: `src/app.ts`");
    expect(captured.systemPrompt).toContain("Git: not a git repository");
  });

  it("runs one-shot completions without tool access or persisted sessions", async () => {
    const registry = new ToolRegistry();
    const captured: { prompt?: string; systemPrompt?: string; toolResult?: ToolResult } =
      {};
    const service = new AgentService(registry, new Logger());
    service.registerAdapter({
      id: "test",
      displayName: "Test",
      async *run(session, host): AsyncIterable<AgentStreamChunk> {
        captured.prompt = session.messages[0]?.content;
        captured.systemPrompt = host.systemPrompt();
        captured.toolResult = await host.callTool({
          id: "c1",
          name: "read_thing",
          args: {},
        });
        yield { type: "text", text: "feat: add completion api" };
        yield { type: "done" };
      },
    });

    const result = await service.complete({
      cwd: "/tmp/project-x",
      prompt: "Generate a commit message",
      systemPrompt: "Return one subject line.",
    });

    expect(result).toEqual({
      text: "feat: add completion api",
      adapterId: "test",
    });
    expect(captured.prompt).toBe("Generate a commit message");
    expect(captured.systemPrompt).toBe("Return one subject line.");
    expect(captured.toolResult?.ok).toBe(false);
    expect(captured.toolResult?.error?.code).toBe("PERMISSION_DENIED");
    expect(service.listSessions()).toEqual([]);
  });

  it("does not treat the deterministic mock adapter as an LLM completion source", async () => {
    const service = new AgentService(new ToolRegistry(), new Logger());
    service.registerAdapter({
      id: "mock",
      displayName: "Mock",
      async *run(): AsyncIterable<AgentStreamChunk> {
        yield { type: "text", text: "mock" };
      },
    });

    await expect(service.complete({ prompt: "Generate a title" })).rejects.toThrow(
      /No LLM agent is configured/,
    );
  });
});

describe("AgentService permission model", () => {
  /** Registry with one read-only and one gated (writes-files) tool. */
  function makeRegistry(): { registry: ToolRegistry; calls: string[] } {
    const calls: string[] = [];
    const registry = new ToolRegistry();
    registry.register(
      defineTool({
        name: "read_thing",
        description: "read-only",
        inputSchema: z.object({}),
        execute: () => {
          calls.push("read_thing");
          return { value: 1 };
        },
      }),
    );
    registry.register(
      defineTool({
        name: "write_thing",
        description: "mutates files",
        inputSchema: z.object({}),
        capabilities: ["writes-files"],
        execute: () => {
          calls.push("write_thing");
          return { written: true };
        },
      }),
    );
    return { registry, calls };
  }

  /** Adapter that calls one tool by name then completes. */
  function callingAdapter(name: string): {
    adapter: AgentAdapter;
    result: { current?: { ok: boolean; error?: { code: string } } };
  } {
    const result: { current?: { ok: boolean; error?: { code: string } } } = {};
    const adapter: AgentAdapter = {
      id: "test",
      displayName: "Test",
      async *run(_session, host): AsyncIterable<AgentStreamChunk> {
        const r = await host.callTool({ id: "c1", name, args: {} });
        result.current = r as { ok: boolean; error?: { code: string } };
        yield { type: "done" };
      },
    };
    return { adapter, result };
  }

  it("auto-runs read-only tools without a permission prompt", async () => {
    const { registry, calls } = makeRegistry();
    const service = new AgentService(registry, new Logger());
    let prompted = false;
    service.on("permission", () => {
      prompted = true;
    });
    const { adapter, result } = callingAdapter("read_thing");
    service.registerAdapter(adapter);
    const session = service.createSession("/tmp/x");
    for await (const _c of service.run(session.id)) void _c;
    expect(prompted).toBe(false);
    expect(calls).toContain("read_thing");
    expect(result.current?.ok).toBe(true);
  });

  it("prompts for gated tools and denies when the user denies", async () => {
    const { registry, calls } = makeRegistry();
    const service = new AgentService(registry, new Logger());
    service.on("permission", (req) => {
      service.permissionDecision({
        sessionId: req.sessionId,
        toolCallId: req.toolCallId,
        decision: "deny",
        remember: false,
      });
    });
    const { adapter, result } = callingAdapter("write_thing");
    service.registerAdapter(adapter);
    const session = service.createSession("/tmp/x");
    for await (const _c of service.run(session.id)) void _c;
    expect(calls).not.toContain("write_thing");
    expect(result.current?.ok).toBe(false);
    expect(result.current?.error?.code).toBe("PERMISSION_DENIED");
  });

  it("runs gated tools when the user allows", async () => {
    const { registry, calls } = makeRegistry();
    const service = new AgentService(registry, new Logger());
    service.on("permission", (req) => {
      service.permissionDecision({
        sessionId: req.sessionId,
        toolCallId: req.toolCallId,
        decision: "allow",
        remember: false,
      });
    });
    const { adapter, result } = callingAdapter("write_thing");
    service.registerAdapter(adapter);
    const session = service.createSession("/tmp/x");
    for await (const _c of service.run(session.id)) void _c;
    expect(calls).toContain("write_thing");
    expect(result.current?.ok).toBe(true);
  });

  it("auto-accepts gated tools when configured", async () => {
    const { registry, calls } = makeRegistry();
    const config = {
      get: () => ({
        adapter: "mock" as const,
        command: "",
        args: [],
        model: "",
        autoAccept: true,
      }),
      set: () => ({
        adapter: "mock" as const,
        command: "",
        args: [],
        model: "",
        autoAccept: true,
      }),
      flush: () => {},
    };
    const service = new AgentService(registry, new Logger(), {
      // biome-ignore lint/suspicious/noExplicitAny: minimal stub for config store
      configStore: config as any,
    });
    let prompted = false;
    service.on("permission", () => {
      prompted = true;
    });
    const { adapter } = callingAdapter("write_thing");
    service.registerAdapter(adapter);
    const session = service.createSession("/tmp/x");
    for await (const _c of service.run(session.id)) void _c;
    expect(prompted).toBe(false);
    expect(calls).toContain("write_thing");
  });
});

describe("AgentService cancellation and run locking", () => {
  it("renames a default session from the prompt when the run starts", async () => {
    const registry = new ToolRegistry();
    const service = new AgentService(registry, new Logger());
    let release!: () => void;
    const adapter: AgentAdapter = {
      id: "test",
      displayName: "Test",
      async *run(): AsyncIterable<AgentStreamChunk> {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        yield { type: "done" };
      },
    };
    service.registerAdapter(adapter);
    const session = service.createSession("/tmp/x");

    const drain = (async () => {
      for await (const _chunk of service.run(session.id, "Fix login crash")) {
        void _chunk;
      }
    })();
    await waitFor(() => service.getSession(session.id)?.status === "running");

    expect(service.getSession(session.id)?.title).toBe("Login Crash");

    release();
    await drain;
  });

  it("publishes automatic title changes to session listeners immediately", async () => {
    const registry = new ToolRegistry();
    const service = new AgentService(registry, new Logger());
    const metas: Array<{ title: string; status: AgentSession["status"] }> = [];
    const adapter: AgentAdapter = {
      id: "test",
      displayName: "Test",
      async *run(): AsyncIterable<AgentStreamChunk> {
        yield { type: "done" };
      },
    };
    service.on("session", (meta: AgentSession) => {
      metas.push({ title: meta.title, status: meta.status });
    });
    service.registerAdapter(adapter);
    const session = service.createSession("/tmp/x");

    for await (const _chunk of service.run(session.id, "Fix login crash")) {
      void _chunk;
    }

    expect(metas).toEqual(
      expect.arrayContaining([{ title: "Login Crash", status: "idle" }]),
    );
  });

  it("keeps custom session titles when a run starts", async () => {
    const registry = new ToolRegistry();
    const service = new AgentService(registry, new Logger());
    const adapter: AgentAdapter = {
      id: "test",
      displayName: "Test",
      async *run(): AsyncIterable<AgentStreamChunk> {
        yield { type: "done" };
      },
    };
    service.registerAdapter(adapter);
    const session = service.createSession({ cwd: "/tmp/x", title: "Release Notes" });

    for await (const _chunk of service.run(session.id, "Update checkout flow")) {
      void _chunk;
    }

    expect(service.getSession(session.id)?.title).toBe("Release Notes");
  });

  it("marks a session as viewed without changing its activity timestamp", async () => {
    const registry = new ToolRegistry();
    const service = new AgentService(registry, new Logger());
    const session = service.createSession("/tmp/x");
    const updatedAt = session.updatedAt;

    const meta = service.markSessionViewed(session.id, updatedAt + 10);

    expect(meta.updatedAt).toBe(updatedAt);
    expect(meta.lastViewedAt).toBe(updatedAt + 10);
    expect(service.getSession(session.id)?.lastViewedAt).toBe(updatedAt + 10);
  });

  it("passes run cancellation through to in-flight tool calls", async () => {
    const registry = new ToolRegistry();
    let toolStarted = false;
    registry.register(
      defineTool({
        name: "slow_tool",
        description: "waits forever unless cancelled by the registry",
        inputSchema: z.object({}),
        execute: () => {
          toolStarted = true;
          return new Promise(() => {});
        },
      }),
    );
    const service = new AgentService(registry, new Logger());
    let toolResult: ToolResult | undefined;
    const adapter: AgentAdapter = {
      id: "test",
      displayName: "Test",
      async *run(_session, host): AsyncIterable<AgentStreamChunk> {
        toolResult = await host.callTool({
          id: "slow-call",
          name: "slow_tool",
          args: {},
        });
        yield { type: "done" };
      },
    };
    service.registerAdapter(adapter);
    const session = service.createSession("/tmp/x");

    const drain = (async () => {
      for await (const _chunk of service.run(session.id, "go")) void _chunk;
    })();
    await waitFor(() => toolStarted);
    service.cancel(session.id);
    await drain;

    expect(toolResult).toMatchObject({
      ok: false,
      error: { code: "CANCELLED" },
    });
  });

  it("finalizes unresolved in-flight tool calls when a run is cancelled", async () => {
    const registry = new ToolRegistry();
    const service = new AgentService(registry, new Logger());
    const adapter: AgentAdapter = {
      id: "test",
      displayName: "Test",
      async *run(_session, host): AsyncIterable<AgentStreamChunk> {
        yield {
          type: "tool_call",
          toolCall: {
            id: "stuck-call",
            name: "get_browser_state",
            args: { tabId: "btab_1" },
            status: "running",
            startedAt: Date.now(),
          },
        };
        await new Promise<void>((resolve) => {
          host.signal.addEventListener("abort", () => resolve(), { once: true });
        });
        yield { type: "done" };
      },
    };
    service.registerAdapter(adapter);
    const session = service.createSession("/tmp/x");

    const drain = (async () => {
      for await (const _chunk of service.run(session.id, "go")) void _chunk;
    })();
    await waitFor(() => service.getSession(session.id)?.status === "running");
    service.cancel(session.id);
    await drain;

    const assistant = service
      .getSession(session.id)
      ?.messages.find((message) => message.role === "assistant");
    const call = assistant?.toolCalls?.[0];

    expect(call?.status).toBe("cancelled");
    expect(call?.endedAt).toBeTypeOf("number");
    expect(call?.result).toMatchObject({
      ok: false,
      error: { code: "TOOL_FAILED" },
    });
  });

  it("rejects concurrent runs on the same session", async () => {
    const registry = new ToolRegistry();
    const service = new AgentService(registry, new Logger());
    let release!: () => void;
    const adapter: AgentAdapter = {
      id: "test",
      displayName: "Test",
      async *run(): AsyncIterable<AgentStreamChunk> {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        yield { type: "done" };
      },
    };
    service.registerAdapter(adapter);
    const session = service.createSession("/tmp/x");
    const first = (async () => {
      for await (const _chunk of service.run(session.id, "one")) void _chunk;
    })();
    await waitFor(() => service.getSession(session.id)?.status === "running");

    await expect(
      service.run(session.id, "two")[Symbol.asyncIterator]().next(),
    ).rejects.toThrow(/already running/);
    expect(service.getSession(session.id)?.messages.map((m) => m.content)).not.toContain(
      "two",
    );

    release();
    await first;
  });
});

describe("AgentConfigStore", () => {
  it("uses <userData>/agent/config.json and migrates the old nested path", async () => {
    const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = await import(
      "node:fs"
    );
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { mkdtempSync } = await import("node:fs");
    const dir = mkdtempSync(join(tmpdir(), "meith-agent-config-"));
    const legacyDir = join(dir, "agent", "agent");
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(
      join(legacyDir, "config.json"),
      JSON.stringify({ adapter: "acp", acpPreset: "codex", autoAccept: true }),
    );

    const store = new AgentConfigStore(dir);
    expect(store.get().adapter).toBe("acp");
    store.flush();

    const nextPath = join(dir, "agent", "config.json");
    expect(existsSync(nextPath)).toBe(true);
    expect(JSON.parse(readFileSync(nextPath, "utf8")).acpPreset).toBe("codex");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("AgentService persistence", () => {
  it("records where tool calls occur within assistant text", async () => {
    const registry = new ToolRegistry();
    registry.register(
      defineTool({
        name: "read_thing",
        description: "read-only",
        inputSchema: z.object({}),
        execute: () => ({ ok: true }),
      }),
    );
    const service = new AgentService(registry, new Logger());
    const adapter: AgentAdapter = {
      id: "test",
      displayName: "Test",
      async *run(_session, host): AsyncIterable<AgentStreamChunk> {
        yield { type: "text", text: "before" };
        const call = { id: "call-inline", name: "read_thing", args: {} };
        yield {
          type: "tool_call",
          toolCall: { ...call, status: "running", startedAt: Date.now() },
        };
        yield {
          type: "tool_result",
          toolCallId: call.id,
          result: await host.callTool(call),
        };
        yield { type: "text", text: "after" };
        yield { type: "done" };
      },
    };
    service.registerAdapter(adapter);
    const session = service.createSession("/tmp/x");
    for await (const _c of service.run(session.id)) void _c;

    const assistant = service
      .getSession(session.id)
      ?.messages.find((message) => message.role === "assistant");
    expect(assistant?.content).toBe("beforeafter");
    expect(assistant?.toolCalls?.[0].contentOffset).toBe("before".length);
    expect(assistant?.textSegments).toEqual([
      { start: 0, end: "before".length, text: "before" },
      { start: "before".length, end: "beforeafter".length, text: "after" },
    ]);
  });

  it("hydrates tool call snapshots without replacing useful labels with generic tool", async () => {
    const { AgentStore } = await import("../services/AgentStore.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "meith-agent-"));
    const store = new AgentStore(dir);
    const createdAt = Date.now();
    const base = {
      id: "msg-tools",
      role: "assistant" as const,
      content: "beforeafter",
      createdAt,
    };

    store.appendMessage("sess-tools", {
      ...base,
      toolCalls: [
        {
          id: "call-1",
          name: "rtk agent-browser get url",
          args: { command: "rtk agent-browser get url" },
          status: "running",
          contentOffset: "before".length,
          startedAt: createdAt,
        },
      ],
    });
    store.appendMessage("sess-tools", {
      ...base,
      toolCalls: [
        {
          id: "call-1",
          name: "tool",
          args: {},
          status: "ok",
          startedAt: createdAt + 1,
          endedAt: createdAt + 2,
        },
      ],
    });

    const [message] = store.readMessages("sess-tools");
    expect(message.toolCalls?.[0].name).toBe("rtk agent-browser get url");
    expect(message.toolCalls?.[0].args).toEqual({
      command: "rtk agent-browser get url",
    });
    expect(message.toolCalls?.[0].status).toBe("ok");
    expect(message.toolCalls?.[0].contentOffset).toBe("before".length);
  });

  it("persists the transcript and reloads it via hydrate()", async () => {
    const { AgentStore } = await import("../services/AgentStore.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "meith-agent-"));

    const registry = new ToolRegistry();
    const store = new AgentStore(dir);
    const service = new AgentService(registry, new Logger(), { store });
    const adapter: AgentAdapter = {
      id: "test",
      displayName: "Test",
      async *run(): AsyncIterable<AgentStreamChunk> {
        yield { type: "text", text: "hello world" };
        yield { type: "done" };
      },
    };
    service.registerAdapter(adapter);
    const session = service.createSession({ cwd: "/tmp/x", title: "T1" });
    for await (const _c of service.run(session.id, "hi")) void _c;
    store.flush();

    // Fresh service + store over the same dir should see the transcript.
    const store2 = new AgentStore(dir);
    const service2 = new AgentService(registry, new Logger(), { store: store2 });
    service2.hydrate();
    const reloaded = service2.getSession(session.id);
    expect(reloaded?.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(reloaded?.messages[0].content).toBe("hi");
    expect(reloaded?.messages[1].content).toBe("hello world");
    expect(reloaded?.status).toBe("idle");
  });

  it("hydrates persisted session metadata without reading transcripts until selected", async () => {
    const { AgentStore } = await import("../services/AgentStore.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "meith-agent-"));

    class CountingStore extends AgentStore {
      reads = 0;

      override readMessages(sessionId: string) {
        this.reads += 1;
        return super.readMessages(sessionId);
      }

      override readDisplayMessages(sessionId: string) {
        this.reads += 1;
        return super.readDisplayMessages(sessionId);
      }

      override readDisplayMessagesFast(sessionId: string) {
        this.reads += 1;
        return super.readDisplayMessagesFast(sessionId);
      }
    }

    const store = new CountingStore(dir);
    store.upsertMeta({
      id: "sess-lazy",
      title: "Lazy",
      cwd: "/tmp/x",
      spaceId: null,
      adapterId: "test",
      status: "running",
      createdAt: 1,
      updatedAt: 2,
      lastViewedAt: 1,
    });
    store.appendMessage("sess-lazy", {
      id: "msg-lazy",
      role: "assistant",
      content: "loaded on demand",
      createdAt: 1,
    });

    const service = new AgentService(new ToolRegistry(), new Logger(), { store });
    service.hydrate();

    expect(store.reads).toBe(0);
    expect(service.listSessions()[0]).toMatchObject({
      id: "sess-lazy",
      status: "idle",
      title: "Lazy",
    });
    expect(store.reads).toBe(0);

    service.markSessionViewed("sess-lazy", 3);
    expect(store.reads).toBe(0);

    const loaded = service.getSession("sess-lazy");
    expect(store.reads).toBeGreaterThan(0);
    expect(loaded?.messages.map((message) => message.content)).toEqual([
      "loaded on demand",
    ]);
  });

  it("keeps run context full but post-run session payload display-limited", async () => {
    const { AgentStore } = await import("../services/AgentStore.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "meith-agent-"));
    const store = new AgentStore(dir);

    store.upsertMeta({
      id: "sess-context",
      title: "Context",
      cwd: "/tmp/x",
      spaceId: null,
      adapterId: "test",
      status: "idle",
      createdAt: 1,
      updatedAt: 1,
      lastViewedAt: 1,
    });
    for (let i = 0; i < 30; i += 1) {
      store.appendMessage("sess-context", {
        id: `msg-${i}`,
        role: "user",
        content: `message ${i}`,
        createdAt: i + 1,
      });
    }

    let seenUserMessages: string[] = [];
    const adapter: AgentAdapter = {
      id: "test",
      displayName: "Test",
      async *run(session): AsyncIterable<AgentStreamChunk> {
        seenUserMessages = session.messages
          .filter((message) => message.role === "user")
          .map((message) => message.content);
        yield { type: "done" };
      },
    };
    const service = new AgentService(new ToolRegistry(), new Logger(), { store });
    service.registerAdapter(adapter);
    service.hydrate();

    const preview = service.getSession("sess-context");
    expect(preview?.messages).toHaveLength(20);

    for await (const _chunk of service.run("sess-context", "latest")) {
      void _chunk;
    }

    expect(seenUserMessages).toEqual([
      ...Array.from({ length: 30 }, (_value, index) => `message ${index}`),
      "latest",
    ]);

    const returned = service.getSession("sess-context");
    expect(returned?.messages.map((message) => message.content)).toEqual([
      ...Array.from({ length: 19 }, (_value, index) => `message ${index + 11}`),
      "latest",
    ]);
  });

  it("applies session model updates to the cached full run context", async () => {
    const { AgentStore } = await import("../services/AgentStore.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "meith-agent-"));
    const store = new AgentStore(dir);

    store.upsertMeta({
      id: "sess-model",
      title: "Model",
      cwd: "/tmp/x",
      spaceId: null,
      adapterId: "test",
      status: "idle",
      createdAt: 1,
      updatedAt: 1,
      lastViewedAt: 1,
    });
    store.appendMessage("sess-model", {
      id: "msg-model",
      role: "user",
      content: "stored context",
      createdAt: 1,
    });

    const seen: Array<{ model?: string; reasoning?: string }> = [];
    const adapter: AgentAdapter = {
      id: "test",
      displayName: "Test",
      async *run(session): AsyncIterable<AgentStreamChunk> {
        seen.push({ model: session.model, reasoning: session.reasoning });
        yield { type: "done" };
      },
    };
    const service = new AgentService(new ToolRegistry(), new Logger(), { store });
    service.registerAdapter(adapter);
    service.hydrate();

    for await (const _chunk of service.run("sess-model", "first")) void _chunk;

    service.setSessionModel("sess-model", {
      model: "new-model",
      reasoning: "high",
    });

    for await (const _chunk of service.run("sess-model", "second")) void _chunk;

    expect(seen).toEqual([
      { model: undefined, reasoning: undefined },
      { model: "new-model", reasoning: "high" },
    ]);
    expect(store.getMeta("sess-model")).toMatchObject({
      model: "new-model",
      reasoning: "high",
    });
  });

  it("persists streamed assistant text chunks before finalization", async () => {
    const { AgentStore } = await import("../services/AgentStore.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "meith-agent-"));
    const store = new AgentStore(dir);
    let release!: () => void;
    const waitForRelease = new Promise<void>((resolve) => {
      release = resolve;
    });
    const adapter: AgentAdapter = {
      id: "test",
      displayName: "Test",
      async *run(): AsyncIterable<AgentStreamChunk> {
        yield { type: "text", text: "partial" };
        await waitForRelease;
        yield { type: "done" };
      },
    };
    const service = new AgentService(new ToolRegistry(), new Logger(), { store });
    service.registerAdapter(adapter);
    const session = service.createSession({ cwd: "/tmp/x", title: "T1" });

    const iterator = service.run(session.id, "hi")[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.value).toMatchObject({ type: "text", text: "partial" });

    const transcriptPath = join(dir, "agent", "sessions", `${session.id}.jsonl`);
    const records = readFileSync(transcriptPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(
      records.some(
        (record) => record.type === "message_patch" && record.contentDelta === "partial",
      ),
    ).toBe(true);

    release();
    await iterator.next();
    await iterator.next();
  });

  it("stores running assistant turns as compact transcript patches", async () => {
    const { AgentStore } = await import("../services/AgentStore.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "meith-agent-"));

    const registry = new ToolRegistry();
    registry.register(
      defineTool({
        name: "read_thing",
        description: "read-only",
        inputSchema: z.object({ value: z.number() }),
        execute: (_ctx, { value }) => ({ ok: true, value }),
      }),
    );
    const store = new AgentStore(dir);
    const service = new AgentService(registry, new Logger(), { store });
    const adapter: AgentAdapter = {
      id: "test",
      displayName: "Test",
      async *run(_session, host): AsyncIterable<AgentStreamChunk> {
        yield { type: "text", text: "before" };
        for (let i = 0; i < 2; i += 1) {
          const call = { id: `call-${i}`, name: "read_thing", args: { value: i } };
          yield {
            type: "tool_call",
            toolCall: { ...call, status: "running", startedAt: Date.now() },
          };
          yield {
            type: "tool_result",
            toolCallId: call.id,
            result: await host.callTool(call),
          };
        }
        yield { type: "text", text: "after" };
        yield { type: "done" };
      },
    };
    service.registerAdapter(adapter);
    const session = service.createSession({ cwd: "/tmp/x", title: "T1" });
    for await (const _c of service.run(session.id, "hi")) void _c;
    store.flush();

    const transcriptPath = join(dir, "agent", "sessions", `${session.id}.jsonl`);
    const records = readFileSync(transcriptPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(
      records.filter(
        (record) => record.role === "assistant" && record.type !== "message_patch",
      ),
    ).toHaveLength(0);
    expect(records.filter((record) => record.type === "message_patch").length).toBe(6);
    expect(records.some((record) => record.contentDelta === "before")).toBe(true);
    expect(records.some((record) => record.contentDelta === "after")).toBe(true);

    const reloaded = new AgentStore(dir).readMessages(session.id);
    const assistant = reloaded.find((message) => message.role === "assistant");
    expect(assistant?.content).toBe("beforeafter");
    expect(assistant?.toolCalls?.map((call) => call.status)).toEqual(["ok", "ok"]);
  });

  it("compacts repeated transcript snapshots on read", async () => {
    const { AgentStore } = await import("../services/AgentStore.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "meith-agent-"));
    const store = new AgentStore(dir);
    const content = "x".repeat(300_000);

    store.upsertMeta({
      id: "sess-large",
      title: "Large",
      cwd: "/tmp/x",
      spaceId: null,
      adapterId: "test",
      status: "idle",
      createdAt: 1,
      updatedAt: 1,
      lastViewedAt: 1,
    });
    for (let i = 0; i < 100; i++) {
      store.appendMessage("sess-large", {
        id: "msg-large",
        role: "assistant",
        content,
        createdAt: 1,
        toolCalls: [
          {
            id: "call-1",
            name: i === 0 ? "real_tool" : "tool",
            args: i === 0 ? { value: true } : {},
            status: i === 99 ? "ok" : "running",
            startedAt: 1,
          },
        ],
      });
    }

    const transcriptPath = join(dir, "agent", "sessions", "sess-large.jsonl");
    expect(statSync(transcriptPath).size).toBeGreaterThan(25 * 1024 * 1024);
    const messages = store.readMessages("sess-large");
    expect(messages).toHaveLength(1);
    expect(messages[0].toolCalls?.[0].name).toBe("real_tool");
    expect(messages[0].toolCalls?.[0].status).toBe("ok");
    expect(statSync(transcriptPath).size).toBeLessThan(2 * 1024 * 1024);
  });

  it("opens oversized transcripts from a bounded tail for display", async () => {
    const { AgentStore } = await import("../services/AgentStore.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "meith-agent-"));
    const store = new AgentStore(dir);
    const content = "x".repeat(300_000);

    for (let i = 0; i < 100; i++) {
      store.appendMessage("sess-display", {
        id: "msg-display",
        role: "assistant",
        content,
        createdAt: 1,
        toolCalls: [
          {
            id: "call-1",
            name: "read_thing",
            args: { value: i },
            status: i === 99 ? "ok" : "running",
            startedAt: 1,
          },
        ],
      });
    }

    const transcriptPath = join(dir, "agent", "sessions", "sess-display.jsonl");
    const before = statSync(transcriptPath).size;
    expect(before).toBeGreaterThan(25 * 1024 * 1024);
    const messages = store.readDisplayMessagesFast("sess-display");
    expect(messages).toHaveLength(1);
    expect(messages[0].content.length).toBeLessThanOrEqual(60_000);
    expect(messages[0].content).toContain("[Earlier content omitted]");
    expect(messages[0].toolCalls?.[0].status).toBe("ok");
    expect(statSync(transcriptPath).size).toBe(before);
  });

  it("keeps display output within the total budget across multiple messages", async () => {
    const { AgentStore } = await import("../services/AgentStore.js");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "meith-agent-"));
    const store = new AgentStore(dir);

    const messages = [
      { id: "huge-old", content: "x".repeat(150_000) },
      { id: "almost-budget", content: "a".repeat(9_990) },
      { id: "full-two", content: "b".repeat(20_000) },
      { id: "full-one", content: "c".repeat(20_000) },
    ];
    for (const [index, message] of messages.entries()) {
      store.appendMessage("sess-budget", {
        id: message.id,
        role: "assistant",
        content: message.content,
        createdAt: index + 1,
      });
    }

    const display = store.readDisplayMessagesFast("sess-budget");
    const totalChars = display.reduce((sum, message) => sum + message.content.length, 0);

    expect(display).toHaveLength(4);
    expect(totalChars).toBeLessThanOrEqual(50_000);
    expect(display[0].id).toBe("huge-old");
    expect(display[0].content.length).toBe(10);
    expect(display[0].content).toBe("[Earlier c");
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
