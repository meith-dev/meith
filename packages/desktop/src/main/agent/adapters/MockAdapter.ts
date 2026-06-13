import { type AgentToolCall, newToolCallId } from "@meith/shared";
import type {
  AgentAdapter,
  AgentHostContext,
  AgentSession,
  AgentStreamChunk,
} from "../types.js";

/**
 * Deterministic in-process adapter used by default when no ACP agent is
 * configured. It exercises the entire runtime loop — streamed text, a tool call
 * through the host (so permissions + persistence are tested), usage, and a
 * terminal `done` — without contacting any external provider. This keeps the
 * app and the test suite working out of the box.
 */
export class MockAdapter implements AgentAdapter {
  readonly id = "mock";
  readonly displayName = "Mock Agent";

  async *run(
    session: AgentSession,
    host: AgentHostContext,
  ): AsyncIterable<AgentStreamChunk> {
    const lastUser = [...session.messages].reverse().find((m) => m.role === "user");
    const prompt = lastUser?.content?.trim() || "(no prompt)";

    yield {
      type: "text",
      text: `You said: "${prompt}". Let me inspect the workspace before answering.`,
    };
    if (host.signal.aborted) {
      yield { type: "done" };
      return;
    }

    // A read-only tool call: auto-allowed, demonstrates the host call path.
    const call: Pick<AgentToolCall, "id" | "name" | "args"> = {
      id: newToolCallId(),
      name: "app_get_state",
      args: {},
    };
    yield {
      type: "tool_call",
      toolCall: {
        ...call,
        status: "running",
        capability: undefined,
        startedAt: Date.now(),
      },
    };
    const result = await host.callTool(call);
    yield { type: "tool_result", toolCallId: call.id, result };

    if (host.signal.aborted) {
      yield { type: "done" };
      return;
    }

    yield {
      type: "text",
      text: result.ok
        ? "The workspace state is readable. (Mock adapter — configure an ACP agent in Settings for real responses.)"
        : "I couldn't read the workspace state.",
    };
    yield {
      type: "usage",
      usage: {
        inputTokens: prompt.length,
        outputTokens: 32,
        totalTokens: prompt.length + 32,
      },
    };
    yield { type: "done" };
  }
}
