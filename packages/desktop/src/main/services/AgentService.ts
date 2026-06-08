import type { ToolDescriptor } from "@meith/protocol";
import { newMessageId, newSessionId } from "@meith/shared";
import type {
  AgentAdapter,
  AgentHostContext,
  AgentMessage,
  AgentSession,
} from "../agent/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { Logger } from "./Logger.js";

/**
 * Manages agent sessions and dispatches runs to a registered adapter.
 *
 * This is intentionally a STUB: no provider is wired up. The wiring point is
 * `registerAdapter()` + `run()`. A future ACP/MCP bridge implements
 * `AgentAdapter` and is registered here; nothing else in the app needs to know
 * which provider is in use.
 */
export class AgentService {
  private sessions = new Map<string, AgentSession>();
  private adapter: AgentAdapter | null = null;

  constructor(
    private readonly registry: ToolRegistry,
    private readonly logger: Logger,
  ) {}

  registerAdapter(adapter: AgentAdapter): void {
    this.adapter = adapter;
    this.logger.info("Agent", `registered adapter: ${adapter.displayName}`);
  }

  createSession(cwd: string): AgentSession {
    const session: AgentSession = {
      id: newSessionId(),
      cwd,
      messages: [],
      createdAt: Date.now(),
      status: "idle",
    };
    this.sessions.set(session.id, session);
    return session;
  }

  getSession(id: string): AgentSession | undefined {
    return this.sessions.get(id);
  }

  appendMessage(
    sessionId: string,
    role: AgentMessage["role"],
    content: string,
  ): AgentMessage {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    const message: AgentMessage = {
      id: newMessageId(),
      role,
      content,
      createdAt: Date.now(),
    };
    session.messages.push(message);
    return message;
  }

  /**
   * Builds the host context an adapter uses to call app tools, scoped to the
   * specific session. Tool calls run with the session's working directory and
   * identity (`caller: "agent"`, `sessionId`) so browser ownership and any
   * cwd-relative behavior are attributed correctly instead of defaulting to the
   * main process cwd.
   */
  private hostContext(session: AgentSession): AgentHostContext {
    return {
      listTools: (): ToolDescriptor[] => this.registry.describe(),
      callTool: (name, args) =>
        this.registry.call(
          { cwd: session.cwd, caller: "agent", sessionId: session.id },
          name,
          args,
        ),
      log: (message) => this.logger.info("Agent", message),
    };
  }

  /**
   * Run a session through the registered adapter.
   * Throws until an adapter is registered — by design, so callers fail loudly.
   */
  async *run(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    if (!this.adapter) {
      throw new Error(
        "No AgentAdapter registered. Implement AgentAdapter (ACP/MCP/SDK) and call registerAdapter().",
      );
    }
    session.status = "running";
    try {
      yield* this.adapter.run(session, this.hostContext());
      session.status = "idle";
    } catch (err) {
      session.status = "error";
      throw err;
    }
  }
}
