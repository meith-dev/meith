import { defineTool } from "@meith/protocol";
import type { ToolResult } from "@meith/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildAcpPrompt } from "../agent/adapters/AcpAdapter.js";
import { buildSystemPrompt, renderToolCatalog } from "../agent/systemPrompt.js";
import type { AgentAdapter, AgentSession, AgentStreamChunk } from "../agent/types.js";
import { AgentConfigStore } from "../services/AgentConfigStore.js";
import { AgentService } from "../services/AgentService.js";
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

  it("instructs agents to prefer Meith tools and answer tool questions from the catalog", () => {
    const reg = new ToolRegistry();
    reg.registerAll(tools);
    const prompt = buildSystemPrompt(reg.describe());

    expect(prompt).toContain("Treat the tools in this Meith catalog");
    expect(prompt).toContain("When the user asks what tools you have");
    expect(prompt).toContain("Available tools");
    expect(prompt).toContain("not say you are unsure");
    expect(prompt).toContain("Never pass placeholder values");
    expect(prompt).toContain("`open_browser_tab`");
  });

  it("handles an empty registry gracefully", () => {
    expect(renderToolCatalog([])).toContain("No tools are currently registered");
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
    expect(prompt[0]?.text).toContain(
      "ASSISTANT: I used an external browser helper.",
    );
    expect(prompt[0]?.text).toContain(
      "Current user request:\nuse meith's tools only",
    );
    expect(prompt[0]?.text).not.toContain("a2");
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
});

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
