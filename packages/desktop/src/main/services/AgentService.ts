import { EventEmitter } from "node:events";
import type { ToolDescriptor } from "@meith/protocol";
import {
  type AgentConfig,
  type AgentMessage,
  type AgentPermissionDecision,
  type AgentPermissionRequest,
  type AgentProbeResult,
  type AgentSession,
  type AgentSessionMeta,
  type AgentStreamChunk,
  type AgentToolCall,
  type AgentUsage,
  type ToolResult,
  defaultAgentConfig,
  errorResult,
  newMessageId,
  newSessionId,
} from "@meith/shared";
import { capabilitiesFor, gatingCapability } from "../agent/permissions.js";
import { buildSystemPrompt } from "../agent/systemPrompt.js";
import type {
  AgentAdapter,
  AgentHostContext,
  AgentPromptContext,
} from "../agent/types.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { AgentConfigStore } from "./AgentConfigStore.js";
import type { AgentStore } from "./AgentStore.js";
import type { AppStateService } from "./AppStateService.js";
import type { Logger } from "./Logger.js";
import type { McpBridgeService } from "./McpBridgeService.js";
import type { PermissionService } from "./PermissionService.js";

export interface AgentServiceOptions {
  store?: AgentStore;
  configStore?: AgentConfigStore;
  appState?: AppStateService;
  mcpBridge?: McpBridgeService;
  permissions?: PermissionService;
  /**
   * Probe a (possibly not-yet-saved) ACP agent for install status + advertised
   * config options. Injected so the service stays provider-agnostic; bootstrap
   * supplies an ACP-backed implementation.
   */
  probeAcp?: (
    override?: Partial<Pick<AgentConfig, "acpPreset" | "command" | "args">>,
  ) => Promise<AgentProbeResult>;
}

/** Input accepted by `createSession`: a bare cwd or a full options object. */
export type CreateSessionInput =
  | string
  | { cwd: string; spaceId?: string | null; title?: string; model?: string };

interface PendingPermission {
  resolve: (decision: AgentPermissionDecision) => void;
}

/**
 * Manages agent sessions and dispatches runs to a registered adapter.
 *
 * Responsibilities:
 * - Session lifecycle + durable persistence (via `AgentStore`).
 * - Building the per-session host context (tools, gated tool calls, system
 *   prompt, cancellation, MCP endpoint).
 * - The permission model: read-only tools auto-run; gated tools prompt the user
 *   (unless auto-accept) via the `permission` event and `permissionDecision()`.
 * - Streaming run output as `chunk`/`session` events for the IPC layer.
 *
 * The adapter is pluggable (mock / ACP); nothing here is provider-specific.
 */
export class AgentService extends EventEmitter {
  private sessions = new Map<string, AgentSession>();
  private adapter: AgentAdapter | null = null;
  private readonly controllers = new Map<string, AbortController>();
  private readonly pending = new Map<string, PendingPermission>();
  /** Remembered per-session decisions, keyed by tool name. */
  private readonly remembered = new Map<string, Map<string, "allow" | "deny">>();
  private readonly lastActivity = new Map<string, number>();
  private gcTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly registry: ToolRegistry,
    private readonly logger: Logger,
    private readonly options: AgentServiceOptions = {},
  ) {
    super();
  }

  registerAdapter(adapter: AgentAdapter): void {
    this.adapter = adapter;
    this.logger.info("Agent", `registered adapter: ${adapter.displayName}`);
  }

  // --- Config --------------------------------------------------------------

  getConfig(): AgentConfig {
    return this.options.configStore?.get() ?? defaultAgentConfig();
  }

  setConfig(patch: Partial<AgentConfig>): AgentConfig {
    const next = this.options.configStore?.set(patch) ?? this.getConfig();
    this.logger.info("Agent", `config updated (adapter=${next.adapter})`);
    // Let bootstrap re-select the adapter when the configured kind changes.
    this.emit("config", next);
    return next;
  }

  /**
   * Probe an ACP agent (optionally overriding the saved preset/command, so the
   * Settings UI can check a draft before saving). Returns install status + the
   * model/reasoning options the agent advertises. The mock adapter has no
   * external dependency, so it reports "installed" with no options.
   */
  async probeAgent(
    override?: Partial<Pick<AgentConfig, "acpPreset" | "command" | "args">>,
  ): Promise<AgentProbeResult> {
    const cfg = { ...this.getConfig(), ...override };
    if (this.options.probeAcp) return this.options.probeAcp(override);
    if (this.adapter?.probe) return this.adapter.probe(override);
    return { preset: cfg.acpPreset ?? "custom", installed: true, options: [] };
  }

  /**
   * Update the model / reasoning level for a session AND persist them as the
   * global default for new sessions. Applied to the next turn the agent runs.
   */
  setSessionModel(
    sessionId: string,
    patch: { model?: string; reasoning?: string },
  ): AgentSessionMeta {
    const session = this.requireSession(sessionId);
    if (patch.model !== undefined) session.model = patch.model || undefined;
    if (patch.reasoning !== undefined) session.reasoning = patch.reasoning || undefined;
    session.updatedAt = Date.now();
    this.persistMeta(session);
    // Persist as the default for future sessions without forcing an adapter
    // re-registration (configStore.set, not setConfig, which emits "config").
    const defaults: Partial<AgentConfig> = {};
    if (patch.model !== undefined) defaults.model = patch.model;
    if (patch.reasoning !== undefined) defaults.reasoning = patch.reasoning;
    if (Object.keys(defaults).length > 0) this.options.configStore?.set(defaults);
    const meta = this.toMeta(session);
    this.emit("session", meta);
    return meta;
  }

  // --- Sessions ------------------------------------------------------------

  /** Hydrate the in-memory session cache from the persisted index on startup. */
  hydrate(): void {
    const store = this.options.store;
    if (!store) return;
    for (const meta of store.listMeta()) {
      // Sessions left "running" by a crash are reset to idle on load.
      const status = meta.status === "running" ? "idle" : meta.status;
      this.sessions.set(meta.id, {
        ...meta,
        status,
        messages: store.readMessages(meta.id),
      });
    }
    this.logger.info("Agent", `hydrated ${this.sessions.size} session(s)`);
  }

  createSession(input: CreateSessionInput): AgentSession {
    const opts = typeof input === "string" ? { cwd: input } : input;
    const now = Date.now();
    const session: AgentSession = {
      id: newSessionId(),
      title: opts.title?.trim() || "New session",
      cwd: opts.cwd,
      spaceId: opts.spaceId ?? null,
      model: opts.model || this.getConfig().model || undefined,
      reasoning: this.getConfig().reasoning || undefined,
      adapterId: this.adapter?.id ?? this.getConfig().adapter,
      status: "idle",
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    this.sessions.set(session.id, session);
    this.persistMeta(session);
    this.touch(session.id);
    return session;
  }

  getSession(id: string): AgentSession | undefined {
    const cached = this.sessions.get(id);
    if (cached) return cached;
    const store = this.options.store;
    const meta = store?.getMeta(id);
    if (!store || !meta) return undefined;
    const session: AgentSession = { ...meta, messages: store.readMessages(id) };
    this.sessions.set(id, session);
    return session;
  }

  listSessions(): AgentSessionMeta[] {
    if (this.options.store) return this.options.store.listMeta();
    return [...this.sessions.values()]
      .map((s) => this.toMeta(s))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  deleteSession(id: string): boolean {
    this.cancel(id);
    void this.adapter?.dispose?.(id);
    this.options.mcpBridge?.unregisterSession(id);
    this.options.permissions?.revokeSession("agent", id);
    this.sessions.delete(id);
    this.remembered.delete(id);
    this.lastActivity.delete(id);
    this.options.store?.deleteSession(id);
    return true;
  }

  appendMessage(
    sessionId: string,
    role: AgentMessage["role"],
    content: string,
  ): AgentMessage {
    const session = this.requireSession(sessionId);
    const message: AgentMessage = {
      id: newMessageId(),
      role,
      content,
      createdAt: Date.now(),
    };
    session.messages.push(message);
    session.updatedAt = message.createdAt;
    this.options.store?.appendMessage(sessionId, message);
    this.persistMeta(session);
    return message;
  }

  // --- Permissions ---------------------------------------------------------

  /** Resolve a pending permission request raised during a run. */
  permissionDecision(decision: AgentPermissionDecision): void {
    const key = `${decision.sessionId}:${decision.toolCallId}`;
    const pending = this.pending.get(key);
    if (!pending) return;
    this.pending.delete(key);
    if (decision.remember) {
      const reqMeta = this.pendingMeta.get(key);
      if (reqMeta) {
        let map = this.remembered.get(decision.sessionId);
        if (!map) {
          map = new Map();
          this.remembered.set(decision.sessionId, map);
        }
        map.set(reqMeta.toolName, decision.decision);
      }
    }
    this.pendingMeta.delete(key);
    pending.resolve(decision);
  }

  private readonly pendingMeta = new Map<string, AgentPermissionRequest>();

  private async requestPermission(
    session: AgentSession,
    request: AgentPermissionRequest,
  ): Promise<AgentPermissionDecision> {
    const key = `${request.sessionId}:${request.toolCallId}`;
    this.pendingMeta.set(key, request);
    return new Promise<AgentPermissionDecision>((resolve) => {
      // Register the resolver BEFORE emitting so a synchronous decision (tests,
      // auto-responders) can resolve it immediately.
      this.pending.set(key, { resolve });
      // Deny automatically if the run is cancelled while awaiting a decision.
      const controller = this.controllers.get(session.id);
      controller?.signal.addEventListener(
        "abort",
        () => {
          if (this.pending.delete(key)) {
            resolve({
              sessionId: request.sessionId,
              toolCallId: request.toolCallId,
              decision: "deny",
              remember: false,
            });
          }
        },
        { once: true },
      );
      this.emit("permission", request);
    });
  }

  // --- Host context --------------------------------------------------------

  private buildPromptContext(session: AgentSession): AgentPromptContext {
    const ctx: AgentPromptContext = {
      cwd: session.cwd,
      autoAccept: this.getConfig().autoAccept,
    };
    const state = this.options.appState?.getState();
    if (state) {
      const space = state.spaces.find((s) => s.id === session.spaceId);
      if (space) ctx.spaceName = space.name;
      ctx.openTabs = state.browserTabs
        .filter((t) => (session.spaceId ? t.spaceId === session.spaceId : true))
        .map((t) => ({ title: t.title, url: t.url }));
    }
    return ctx;
  }

  /**
   * Run a single tool call with the session's identity, applying the permission
   * model. Read-only tools run immediately; gated tools prompt the user (unless
   * auto-accept or a remembered decision applies) and resolve to
   * `PERMISSION_DENIED` if denied.
   */
  private async gatedCall(
    session: AgentSession,
    toolCall: Pick<AgentToolCall, "id" | "name" | "args">,
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    this.touch(session.id);
    const caps = capabilitiesFor(this.registry.describe(), toolCall.name);
    const cap = gatingCapability(caps);

    if (cap) {
      const auto = this.getConfig().autoAccept;
      const remembered = this.remembered.get(session.id)?.get(toolCall.name);
      let allowed = auto || remembered === "allow";
      if (!allowed && remembered === "deny") {
        return errorResult(
          "PERMISSION_DENIED",
          `Tool "${toolCall.name}" was denied for this session.`,
        );
      }
      if (!allowed) {
        const decision = await this.requestPermission(session, {
          sessionId: session.id,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          capability: cap,
          args: toolCall.args,
        });
        allowed = decision.decision === "allow";
      }
      if (!allowed) {
        return errorResult("PERMISSION_DENIED", `User denied "${toolCall.name}".`);
      }
      this.options.permissions?.grant({
        caller: "agent",
        sessionId: session.id,
        toolName: toolCall.name,
        capabilities: caps,
        uses: 1,
      });
    }

    return this.registry.call(
      {
        cwd: session.cwd,
        caller: "agent",
        sessionId: session.id,
        spaceId: session.spaceId ?? undefined,
      },
      toolCall.name,
      toolCall.args,
      { signal },
    );
  }

  private hostContext(
    session: AgentSession,
    signal: AbortSignal,
    mcpEndpoint?: { url: string; token: string },
  ): AgentHostContext {
    return {
      listTools: (): ToolDescriptor[] => this.registry.describe(),
      callTool: (toolCall) => this.gatedCall(session, toolCall, signal),
      systemPrompt: () =>
        buildSystemPrompt(this.registry.describe(), this.buildPromptContext(session)),
      signal,
      cwd: session.cwd,
      model: session.model,
      mcpEndpoint,
      log: (message) => this.logger.info("Agent", message),
    };
  }

  // --- Run -----------------------------------------------------------------

  /**
   * Run a session through the registered adapter, streaming chunks. If
   * `userText` is provided it is appended as a user message first. Chunks are
   * also emitted as `chunk` events for the IPC layer; the transcript is
   * persisted as the turn progresses.
   */
  async *run(sessionId: string, userText?: string): AsyncIterable<AgentStreamChunk> {
    const session = this.requireSession(sessionId);
    if (!this.adapter) {
      throw new Error(
        "No AgentAdapter registered. Implement AgentAdapter (ACP/MCP/SDK) and call registerAdapter().",
      );
    }
    if (session.status === "running" || this.controllers.has(sessionId)) {
      throw new Error(`Agent session is already running: ${sessionId}`);
    }
    if (userText !== undefined) this.appendMessage(sessionId, "user", userText);

    const controller = new AbortController();
    this.controllers.set(sessionId, controller);
    this.setStatus(session, "running");

    // Register an MCP endpoint so an external (ACP) agent can call our tools
    // with this session's identity. In-process adapters use host.callTool.
    let mcpEndpoint: { url: string; token: string } | undefined;
    const bridge = this.options.mcpBridge;
    if (bridge && this.adapter.id === "acp") {
      await bridge.start();
      mcpEndpoint = bridge.registerSession({
        sessionId,
        listTools: () => this.registry.describe(),
        callTool: (toolCall) => this.gatedCall(session, toolCall, controller.signal),
      });
    }

    const host = this.hostContext(session, controller.signal, mcpEndpoint);
    const assistant = this.beginAssistantMessage(session);

    try {
      for await (const chunk of this.adapter.run(session, host)) {
        this.applyChunk(session, assistant, chunk);
        this.emit("chunk", { sessionId, chunk });
        yield chunk;
        if (controller.signal.aborted) break;
      }
      this.finalizeAssistant(session, assistant);
      this.setStatus(session, controller.signal.aborted ? "cancelled" : "idle");
    } catch (err) {
      assistant.error = err instanceof Error ? err.message : String(err);
      this.finalizeAssistant(session, assistant);
      this.setStatus(session, "error");
      const chunk: AgentStreamChunk = { type: "error", message: assistant.error };
      this.emit("chunk", { sessionId, chunk });
      yield chunk;
    } finally {
      this.controllers.delete(sessionId);
      bridge?.unregisterSession(sessionId);
      this.touch(sessionId);
    }
  }

  /** Cancel a running session: aborts the adapter and denies pending prompts. */
  cancel(sessionId: string): void {
    this.controllers.get(sessionId)?.abort();
  }

  // --- Internal helpers ----------------------------------------------------

  private beginAssistantMessage(session: AgentSession): AgentMessage {
    const message: AgentMessage = {
      id: newMessageId(),
      role: "assistant",
      content: "",
      toolCalls: [],
      createdAt: Date.now(),
    };
    session.messages.push(message);
    return message;
  }

  private applyChunk(
    session: AgentSession,
    assistant: AgentMessage,
    chunk: AgentStreamChunk,
  ): void {
    switch (chunk.type) {
      case "text":
        appendAssistantText(assistant, chunk.text);
        break;
      case "tool_call": {
        assistant.toolCalls = assistant.toolCalls ?? [];
        const existing = assistant.toolCalls.find((c) => c.id === chunk.toolCall.id);
        if (existing) mergeToolCall(existing, chunk.toolCall);
        else {
          assistant.toolCalls.push({
            ...chunk.toolCall,
            contentOffset: chunk.toolCall.contentOffset ?? assistant.content.length,
          });
        }
        this.persistMessage(session, assistant);
        break;
      }
      case "tool_result": {
        const call = assistant.toolCalls?.find((c) => c.id === chunk.toolCallId);
        if (call) {
          call.result = chunk.result;
          call.status = chunk.result.ok ? "ok" : "error";
          call.endedAt = Date.now();
        }
        this.persistMessage(session, assistant);
        break;
      }
      case "usage":
        assistant.usage = chunk.usage;
        session.usage = mergeUsage(session.usage, chunk.usage);
        break;
      case "error":
        assistant.error = chunk.message;
        break;
      default:
        break;
    }
    session.updatedAt = Date.now();
  }

  private finalizeAssistant(session: AgentSession, assistant: AgentMessage): void {
    // Drop a fully-empty assistant message (e.g. immediate cancel).
    if (
      !assistant.content &&
      (!assistant.toolCalls || assistant.toolCalls.length === 0) &&
      !assistant.error
    ) {
      session.messages = session.messages.filter((m) => m.id !== assistant.id);
      return;
    }
    this.persistMessage(session, assistant);
  }

  private setStatus(session: AgentSession, status: AgentSession["status"]): void {
    session.status = status;
    session.updatedAt = Date.now();
    this.persistMeta(session);
    this.emit("session", this.toMeta(session));
  }

  private persistMessage(session: AgentSession, message: AgentMessage): void {
    this.options.store?.appendMessage(session.id, message);
  }

  private persistMeta(session: AgentSession): void {
    this.options.store?.upsertMeta(this.toMeta(session));
  }

  private toMeta(session: AgentSession): AgentSessionMeta {
    const { messages: _messages, ...meta } = session;
    return meta;
  }

  private touch(sessionId: string): void {
    this.lastActivity.set(sessionId, Date.now());
  }

  private requireSession(sessionId: string): AgentSession {
    const session = this.getSession(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    return session;
  }

  // --- Lifecycle / GC ------------------------------------------------------

  /**
   * Start a periodic sweep that disposes idle (non-running) sessions' live
   * resources: ACP child processes and MCP token bindings. Persisted
   * transcripts are untouched — only in-memory/process resources are reclaimed.
   */
  startIdleGc(maxIdleMs = 30 * 60_000, intervalMs = 5 * 60_000): void {
    if (this.gcTimer) return;
    this.gcTimer = setInterval(() => this.sweepIdle(maxIdleMs), intervalMs);
    this.gcTimer.unref?.();
  }

  sweepIdle(maxIdleMs: number): void {
    const now = Date.now();
    for (const [id, last] of this.lastActivity) {
      const session = this.sessions.get(id);
      if (session?.status === "running") continue;
      if (now - last < maxIdleMs) continue;
      void this.adapter?.dispose?.(id);
      this.options.mcpBridge?.unregisterSession(id);
      this.lastActivity.delete(id);
    }
  }

  /** Stop the GC timer and tear down any live runs (called on shutdown). */
  async dispose(): Promise<void> {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    for (const id of this.sessions.keys()) await this.adapter?.dispose?.(id);
    this.options.store?.flush();
    this.options.configStore?.flush();
  }
}

function appendAssistantText(assistant: AgentMessage, text: string): void {
  if (!text) return;
  const start = assistant.content.length;
  const end = start + text.length;
  assistant.content += text;
  assistant.textSegments = assistant.textSegments ?? [];

  const startsAfterTool = assistant.toolCalls?.some(
    (call) => call.contentOffset === start,
  );
  const previous = assistant.textSegments.at(-1);
  if (previous && previous.end === start && !startsAfterTool) {
    previous.text += text;
    previous.end = end;
    return;
  }
  assistant.textSegments.push({ start, end, text });
}

function mergeToolCall(target: AgentToolCall, incoming: AgentToolCall): void {
  const previousName = target.name;
  const previousArgs = target.args;
  const previousStartedAt = target.startedAt;
  const previousResult = target.result;
  const previousError = target.error;
  const previousContentOffset = target.contentOffset;
  const incomingNameIsGeneric = incoming.name.trim().toLowerCase() === "tool";
  const incomingHasArgs = Object.keys(incoming.args ?? {}).length > 0;

  Object.assign(target, incoming);

  if (incomingNameIsGeneric && previousName.trim().toLowerCase() !== "tool") {
    target.name = previousName;
  }
  if (!incomingHasArgs && Object.keys(previousArgs ?? {}).length > 0) {
    target.args = previousArgs;
  }
  target.startedAt = Math.min(previousStartedAt, incoming.startedAt);
  target.result = incoming.result ?? previousResult;
  target.error = incoming.error ?? previousError;
  target.contentOffset = incoming.contentOffset ?? previousContentOffset;
}

/** Sum two optional usage records field-by-field. */
function mergeUsage(a: AgentUsage | undefined, b: AgentUsage): AgentUsage {
  return {
    inputTokens: (a?.inputTokens ?? 0) + (b.inputTokens ?? 0),
    outputTokens: (a?.outputTokens ?? 0) + (b.outputTokens ?? 0),
    totalTokens: (a?.totalTokens ?? 0) + (b.totalTokens ?? 0),
  };
}
