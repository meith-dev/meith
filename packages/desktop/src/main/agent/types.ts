import type { ToolDescriptor } from "@meith/protocol";
import type { ToolResult } from "@meith/shared";

/**
 * Provider-agnostic agent runtime interfaces.
 *
 * NOTHING here hardcodes Claude / Codex / OpenAI specifics. A concrete adapter
 * (an ACP bridge, an MCP client, or a direct SDK call) implements `AgentAdapter`
 * and is registered with `AgentService`. This keeps the core decoupled from any
 * single AI provider.
 */

export type AgentRole = "system" | "user" | "assistant" | "tool";

export interface AgentMessage {
  id: string;
  role: AgentRole;
  /** Plain text content. Rich/structured content can be added later. */
  content: string;
  /** For tool messages: which tool produced/consumed this. */
  toolName?: string;
  createdAt: number;
}

export interface AgentSession {
  id: string;
  /** Working directory the agent operates in. */
  cwd: string;
  messages: AgentMessage[];
  createdAt: number;
  status: "idle" | "running" | "error";
}

/** What the host exposes to an adapter: the tools it may call, and a logger. */
export interface AgentHostContext {
  /** Tools the agent is allowed to call (same registry as CLI/renderer). */
  listTools: () => ToolDescriptor[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
  /**
   * The composed system prompt for this session. The tool catalog inside it is
   * generated from the live registry, so adapters should use this verbatim
   * instead of maintaining their own hardcoded tool list.
   */
  systemPrompt: () => string;
  log: (message: string) => void;
}

/** Streamed chunk emitted while an adapter produces a response. */
export interface AgentStreamChunk {
  type: "text" | "tool_call" | "tool_result" | "done" | "error";
  text?: string;
  toolName?: string;
  data?: unknown;
}

/**
 * A pluggable backend for a specific provider/protocol.
 * Implement this for ACP, MCP, or a direct provider SDK.
 */
export interface AgentAdapter {
  readonly id: string;
  readonly displayName: string;
  /**
   * Send the current session to the backend and stream back chunks.
   * Implementations may call `host.callTool` to use app tools.
   */
  run(session: AgentSession, host: AgentHostContext): AsyncIterable<AgentStreamChunk>;
}
