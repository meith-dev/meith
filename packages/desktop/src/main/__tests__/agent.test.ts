import { defineTool } from "@meith/protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildSystemPrompt, renderToolCatalog } from "../agent/systemPrompt.js";
import type { AgentAdapter, AgentSession, AgentStreamChunk } from "../agent/types.js";
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

  it("handles an empty registry gracefully", () => {
    expect(renderToolCatalog([])).toContain("No tools are currently registered");
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
        await host.callTool("__probe", {});
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
