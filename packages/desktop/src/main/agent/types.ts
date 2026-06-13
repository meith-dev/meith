import type { ToolDescriptor } from "@meith/protocol";
import type {
  AgentMessage,
  AgentPermissionRequest,
  AgentSession,
  AgentStreamChunk,
  AgentToolCall,
  ToolResult,
} from "@meith/shared";

/**
 * Provider-agnostic agent runtime interfaces.
 *
 * NOTHING here hardcodes Claude / Codex / OpenAI specifics. A concrete adapter
 * (an ACP bridge, an MCP client, or a direct SDK call) implements `AgentAdapter`
 * and is registered with `AgentService`. This keeps the core decoupled from any
 * single AI provider.
 *
 * The serializable shapes (`AgentSession`, `AgentMessage`, `AgentToolCall`,
 * `AgentStreamChunk`, ...) live in `@meith/shared` so the renderer chat UI and
 * the CLI share them. The interfaces below carry functions and therefore stay
 * in the main process.
 */

export type {
  AgentMessage,
  AgentRole,
  AgentSession,
  AgentSessionMeta,
  AgentSessionStatus,
  AgentStreamChunk,
  AgentToolCall,
  AgentToolCallStatus,
  AgentUsage,
  AgentPermissionRequest,
  AgentPermissionDecision,
} from "@meith/shared";

/**
 * Context describing the live workspace, passed to `buildSystemPrompt` so the
 * agent knows where it is operating and what is currently open.
 */
export interface AgentPromptContext {
  /** Working directory the session operates in. */
  cwd: string;
  /** Active space name, when the session is associated with one. */
  spaceName?: string;
  /** URLs/titles of browser tabs currently open in the session's space. */
  openTabs?: Array<{ title: string; url: string }>;
  /** Whether gated tool calls are auto-accepted (affects the safety section). */
  autoAccept?: boolean;
}

/**
 * What the host exposes to an adapter: the tools it may call, a permission
 * gate, a logger, and the composed system prompt — all scoped to one session.
 */
export interface AgentHostContext {
  /** Tools the agent is allowed to call (same registry as CLI/renderer). */
  listTools: () => ToolDescriptor[];
  /**
   * Call a tool. Read-only tools run immediately; gated tools (writes/process/
   * browser/destructive) are routed through the permission flow first and
   * resolve to a `PERMISSION_DENIED` result if the user denies.
   */
  callTool: (
    toolCall: Pick<AgentToolCall, "id" | "name" | "args">,
  ) => Promise<ToolResult>;
  /**
   * The composed system prompt for this session. The tool catalog inside it is
   * generated from the live registry, so adapters should use this verbatim
   * instead of maintaining their own hardcoded tool list.
   */
  systemPrompt: () => string;
  /**
   * Aborts when the session run is cancelled (user pressed Stop) or torn down.
   * Adapters MUST observe this to stop streaming/spawned work promptly.
   */
  signal: AbortSignal;
  /** Working directory for this session. */
  cwd: string;
  /** Model identifier configured for this session, if any. */
  model?: string;
  /**
   * MCP bridge endpoint the host exposes for THIS session, so an external agent
   * (ACP subprocess) can call the same tools with `caller: "agent"` scoping.
   * Undefined when no bridge is running.
   */
  mcpEndpoint?: { url: string; token: string };
  log: (message: string) => void;
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
   * Implementations may call `host.callTool` to use app tools and MUST observe
   * `host.signal` for cancellation. The full prior transcript is available on
   * `session.messages` so adapters can resume/continue a conversation.
   */
  run(session: AgentSession, host: AgentHostContext): AsyncIterable<AgentStreamChunk>;
  /** Optional cleanup hook (e.g. kill a spawned subprocess) for a session. */
  dispose?(sessionId: string): void | Promise<void>;
}

/** Re-export used by adapters/services that need the message-builder signature. */
export type { AgentMessage as TranscriptMessage };
export type { AgentPermissionRequest as PermissionRequest };
