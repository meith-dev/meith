import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import type { ToolDescriptor } from "@meith/protocol";
import {
  type AgentAttachment,
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
  DEFAULT_AGENT_SESSION_TITLE,
  type ToolResult,
  defaultAgentConfig,
  errorResult,
  isDefaultAgentSessionTitle,
  newMessageId,
  newSessionId,
  summarizeAgentSessionTitle,
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
import type { AgentMessagePatch, AgentStore } from "./AgentStore.js";
import type { AppStateService } from "./AppStateService.js";
import type { BrowserTabService } from "./BrowserTabService.js";
import type { DevServerService } from "./DevServerService.js";
import type { Logger } from "./Logger.js";
import type { McpBridgeService, McpSessionEndpoint } from "./McpBridgeService.js";
import type { PermissionService } from "./PermissionService.js";
import type { TerminalService } from "./TerminalService.js";

export interface AgentServiceOptions {
  store?: AgentStore;
  configStore?: AgentConfigStore;
  appState?: AppStateService;
  browserTabs?: BrowserTabService;
  terminals?: TerminalService;
  devServers?: DevServerService;
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

export interface StageAttachmentInput {
  name?: string;
  mimeType?: string;
  sourcePath?: string;
  dataBase64?: string;
}

export interface AgentCompletionInput {
  prompt?: string;
  systemPrompt?: string;
  cwd?: string;
  maxChars?: number;
  timeoutMs?: number;
}

export interface AgentCompletionResult {
  text: string;
  adapterId: string;
}

export type AgentRunInput =
  | string
  | {
      text?: string;
      attachments?: AgentAttachment[];
    };

interface PendingPermission {
  resolve: (decision: AgentPermissionDecision) => void;
}

type TranscriptLoadMode = "display" | "full";

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
  private transcriptLoadMode = new Map<string, TranscriptLoadMode>();
  private adapter: AgentAdapter | null = null;
  private readonly controllers = new Map<string, AbortController>();
  private readonly pending = new Map<string, PendingPermission>();
  private readonly persistedAssistantContentLength = new Map<string, number>();
  /** Remembered per-session decisions, keyed by tool name. */
  private readonly remembered = new Map<string, Map<string, "allow" | "deny">>();
  private readonly lastActivity = new Map<string, number>();
  private gcTimer: NodeJS.Timeout | null = null;
  /**
   * Cache of probe results keyed by the probe target (preset/command/args).
   * Probing spawns the agent subprocess and runs a full handshake, so we reuse
   * the result across agent-panel mounts instead of re-probing every time.
   * Successful probes live longer than failures so a freshly-installed CLI is
   * picked up quickly. Cleared whenever the agent config changes.
   */
  private readonly probeCache = new Map<
    string,
    { result: AgentProbeResult; expiresAt: number }
  >();
  private static readonly PROBE_TTL_OK = 5 * 60_000;
  private static readonly PROBE_TTL_FAIL = 15_000;

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
    // Invalidate cached probes: the agent target may have changed, and the user
    // may have just installed/updated the CLI, so the next probe should be live.
    this.probeCache.clear();
    // Let bootstrap re-select the adapter when the configured kind changes.
    this.emit("config", next);
    return next;
  }

  /**
   * Probe an ACP agent (optionally overriding the saved preset/command, so the
   * Settings UI can check a draft before saving). Returns install status + the
   * model/reasoning options the agent advertises. The mock adapter has no
   * external dependency, so it reports "installed" with no options.
   *
   * Results are cached per target (see `probeCache`); pass `{ force: true }` to
   * bypass the cache and re-probe (e.g. an explicit "re-check" action).
   */
  async probeAgent(
    override?: Partial<Pick<AgentConfig, "acpPreset" | "command" | "args">> & {
      force?: boolean;
    },
  ): Promise<AgentProbeResult> {
    const { force, ...targetOverride } = override ?? {};
    const cfg = { ...this.getConfig(), ...targetOverride };
    const key = `${cfg.adapter}|${cfg.acpPreset ?? "custom"}|${cfg.command ?? ""}|${(cfg.args ?? []).join(" ")}`;

    if (!force) {
      const cached = this.probeCache.get(key);
      if (cached && cached.expiresAt > Date.now()) return cached.result;
    }

    const result = await this.runProbe(targetOverride, cfg.acpPreset ?? "custom");
    const ttl = result.installed
      ? AgentService.PROBE_TTL_OK
      : AgentService.PROBE_TTL_FAIL;
    this.probeCache.set(key, { result, expiresAt: Date.now() + ttl });
    return result;
  }

  /** Run the actual probe against the configured probe source / adapter. */
  private runProbe(
    override: Partial<Pick<AgentConfig, "acpPreset" | "command" | "args">>,
    preset: AgentProbeResult["preset"],
  ): Promise<AgentProbeResult> {
    if (this.options.probeAcp) return this.options.probeAcp(override);
    if (this.adapter?.probe) return this.adapter.probe(override);
    return Promise.resolve({ preset, installed: true, options: [] });
  }

  /**
   * Update the model / reasoning level for a session AND persist them as the
   * global default for new sessions. Applied to the next turn the agent runs.
   */
  setSessionModel(
    sessionId: string,
    patch: { model?: string; reasoning?: string },
  ): AgentSessionMeta {
    const session = this.getOrCreateSessionFromMeta(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
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

  /**
   * Run a one-shot, non-persisted completion through the configured real agent
   * adapter. This is for renderer features such as commit-message or title
   * generation that need LLM output without creating chat history.
   */
  async complete(input: AgentCompletionInput): Promise<AgentCompletionResult> {
    const prompt = input.prompt?.trim();
    if (!prompt) throw new Error("Completion prompt is required.");
    if (!this.adapter) throw new Error("No agent adapter is configured.");
    if (this.adapter.id === "mock") {
      throw new Error("No LLM agent is configured. Configure an ACP agent in Settings.");
    }

    const cfg = this.getConfig();
    const now = Date.now();
    const session: AgentSession = {
      id: `completion_${randomUUID().slice(0, 10)}`,
      title: "Completion",
      cwd: input.cwd?.trim() || process.cwd(),
      spaceId: null,
      model: cfg.model || undefined,
      reasoning: cfg.reasoning || undefined,
      adapterId: this.adapter.id,
      status: "running",
      createdAt: now,
      updatedAt: now,
      lastViewedAt: now,
      messages: [
        {
          id: newMessageId(),
          role: "user",
          content: prompt,
          createdAt: now,
        },
      ],
    };
    const controller = new AbortController();
    const timeoutMs = Math.min(Math.max(input.timeoutMs ?? 45_000, 1_000), 120_000);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref?.();

    const host: AgentHostContext = {
      listTools: () => [],
      callTool: (toolCall) =>
        Promise.resolve(
          errorResult(
            "PERMISSION_DENIED",
            `Completion requests cannot call tools (${toolCall.name}).`,
          ),
        ),
      systemPrompt: () =>
        input.systemPrompt?.trim() ||
        "You are a concise completion engine. Return only the requested text.",
      signal: controller.signal,
      cwd: session.cwd,
      model: session.model,
      log: (message) => this.logger.info("Agent", message),
    };

    let text = "";
    try {
      for await (const chunk of this.adapter.run(session, host)) {
        if (chunk.type === "text") text += chunk.text;
        if (chunk.type === "error") throw new Error(chunk.message);
        if (controller.signal.aborted) break;
      }
      if (controller.signal.aborted) {
        throw new Error(`Completion timed out after ${timeoutMs}ms.`);
      }
      const maxChars = Math.min(Math.max(input.maxChars ?? 2_000, 1), 20_000);
      return {
        text: text.trim().slice(0, maxChars),
        adapterId: this.adapter.id,
      };
    } finally {
      clearTimeout(timeout);
      void this.adapter.dispose?.(session.id);
    }
  }

  // --- Sessions ------------------------------------------------------------

  /** Hydrate the in-memory session cache from the persisted index on startup. */
  hydrate(): void {
    const store = this.options.store;
    if (!store) return;
    for (const meta of store.listMeta()) {
      // Sessions left "running" by a crash are reset to idle on load.
      const status = meta.status === "running" ? "idle" : meta.status;
      this.sessions.set(meta.id, { ...meta, status, messages: [] });
    }
    this.transcriptLoadMode.clear();
    this.logger.info(
      "Agent",
      `hydrated ${this.sessions.size} session metadata record(s)`,
    );
  }

  createSession(input: CreateSessionInput): AgentSession {
    const opts = typeof input === "string" ? { cwd: input } : input;
    const now = Date.now();
    const session: AgentSession = {
      id: newSessionId(),
      title: opts.title?.trim() || DEFAULT_AGENT_SESSION_TITLE,
      cwd: opts.cwd,
      spaceId: opts.spaceId ?? null,
      model: opts.model || this.getConfig().model || undefined,
      reasoning: this.getConfig().reasoning || undefined,
      adapterId: this.adapter?.id ?? this.getConfig().adapter,
      status: "idle",
      createdAt: now,
      updatedAt: now,
      lastViewedAt: now,
      messages: [],
    };
    this.sessions.set(session.id, session);
    this.transcriptLoadMode.set(session.id, "full");
    this.persistMeta(session);
    this.touch(session.id);
    return session;
  }

  getSession(id: string): AgentSession | undefined {
    const session = this.getOrCreateSessionFromMeta(id);
    return session ? this.ensureTranscriptLoaded(session, "display") : undefined;
  }

  listSessions(): AgentSessionMeta[] {
    if (this.sessions.size > 0) {
      return [...this.sessions.values()]
        .map((s) => this.toMeta(s))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    }
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
    this.transcriptLoadMode.delete(id);
    this.remembered.delete(id);
    this.lastActivity.delete(id);
    this.options.store?.deleteSession(id);
    return true;
  }

  /** Mark a session as viewed without changing its activity ordering. */
  markSessionViewed(id: string, viewedAt = Date.now()): AgentSessionMeta {
    const cached = this.sessions.get(id);
    const storedMeta = cached ? null : this.options.store?.getMeta(id);
    const session = cached ?? (storedMeta ? { ...storedMeta, messages: [] } : null);
    if (!session) throw new Error(`Unknown session: ${id}`);
    if (!cached) this.sessions.set(id, session);
    session.lastViewedAt = Math.max(session.lastViewedAt ?? 0, viewedAt);
    this.persistMeta(session);
    const viewedMeta = this.toMeta(session);
    this.emit("session", viewedMeta);
    return viewedMeta;
  }

  appendMessage(
    sessionId: string,
    role: AgentMessage["role"],
    content: string,
    options?: { attachments?: AgentAttachment[] },
  ): AgentMessage {
    const session = this.requireSession(sessionId, "full");
    const message: AgentMessage = {
      id: newMessageId(),
      role,
      content,
      attachments: options?.attachments,
      createdAt: Date.now(),
    };
    session.messages.push(message);
    session.updatedAt = message.createdAt;
    this.options.store?.appendMessage(sessionId, message);
    this.persistMeta(session);
    return message;
  }

  /**
   * Stage a dropped/pasted file into `<session.cwd>/.meith/attachments` so the
   * agent can reference it in tools constrained to the session workspace.
   */
  stageAttachment(sessionId: string, input: StageAttachmentInput): AgentAttachment {
    const session = this.requireSession(sessionId, "display");
    const sourcePath = input.sourcePath?.trim() || undefined;
    const dataBase64 = input.dataBase64?.trim() || undefined;
    if (!sourcePath && !dataBase64) {
      throw new Error("Attachment requires sourcePath or dataBase64.");
    }

    const sourceName = sourcePath ? basename(sourcePath) : "attachment";
    const requestedName = input.name?.trim() || sourceName;
    const safeName = sanitizeAttachmentName(requestedName);
    const attachmentsDir = join(session.cwd, ".meith", "attachments");
    mkdirSync(attachmentsDir, { recursive: true });

    const ext = extname(safeName);
    const stem = ext ? safeName.slice(0, -ext.length) : safeName;
    const unique = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const targetName = ext ? `${stem}-${unique}${ext}` : `${stem}-${unique}`;
    const targetPath = join(attachmentsDir, targetName);

    if (sourcePath) {
      copyFileSync(sourcePath, targetPath);
    } else if (dataBase64) {
      const data = Buffer.from(dataBase64, "base64");
      writeFileSync(targetPath, data);
    }

    const sizeBytes = statSync(targetPath).size;
    return {
      id: `att_${randomUUID().slice(0, 10)}`,
      name: safeName,
      path: targetPath,
      kind: inferAttachmentKind(input.mimeType, safeName),
      mimeType: input.mimeType?.trim() || undefined,
      sizeBytes,
      createdAt: Date.now(),
    };
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
      const browserTabs = state.browserTabs.filter((t) =>
        session.spaceId ? t.spaceId === session.spaceId : true,
      );
      const workspaceTabs = state.workspaceTabs.filter((t) =>
        session.spaceId ? t.spaceId === session.spaceId : true,
      );
      const activeEditor =
        workspaceTabs.find((t) => t.kind === "editor" && t.active && t.activeFilePath) ??
        workspaceTabs.find((t) => t.kind === "editor" && t.activeFilePath);
      if (activeEditor?.activeFilePath) {
        ctx.activeEditorFile = {
          tabTitle: activeEditor.title,
          cwd: activeEditor.cwd,
          path: activeEditor.activeFilePath,
        };
      }
      const selectedGit =
        workspaceTabs.find(
          (t) => t.kind === "git" && t.active && t.selectedGitFilePath,
        ) ?? workspaceTabs.find((t) => t.kind === "git" && t.selectedGitFilePath);
      if (selectedGit?.selectedGitFilePath) {
        ctx.selectedGitFile = {
          tabTitle: selectedGit.title,
          cwd: selectedGit.cwd,
          path: selectedGit.selectedGitFilePath,
        };
      }
      ctx.openTabs = browserTabs
        .filter((t) => (session.spaceId ? t.spaceId === session.spaceId : true))
        .map((t) => ({ title: t.title, url: t.url }));
      ctx.consoleErrors = browserTabs.flatMap((tab) =>
        (this.options.browserTabs?.getConsoleLogSnapshot(tab.id, 10) ?? [])
          .filter((entry) => entry.level === "error")
          .slice(-3)
          .map((entry) => ({
            tabTitle: tab.title,
            url: tab.url,
            text: entry.text,
            source: entry.source,
          })),
      );
      const relevantCwds = new Set([
        resolve(session.cwd),
        ...workspaceTabs.map((t) => resolve(t.cwd)),
        ...state.projects
          .filter((project) =>
            session.spaceId
              ? project.spaceId === session.spaceId
              : project.cwd === session.cwd,
          )
          .map((project) => resolve(project.cwd)),
      ]);
      const terminalTabs = new Map(
        workspaceTabs
          .filter((tab) => tab.kind === "terminal" && tab.terminalId)
          .map((tab) => [tab.terminalId as string, tab]),
      );
      ctx.terminals = (this.options.terminals?.list() ?? [])
        .filter(
          (terminal) =>
            terminalTabs.has(terminal.id) || relevantCwds.has(resolve(terminal.cwd)),
        )
        .map((terminal) => {
          const tab = terminalTabs.get(terminal.id);
          return {
            id: terminal.id,
            tabTitle: tab?.title,
            cwd: terminal.cwd,
            status: terminal.status,
            pid: terminal.pid,
            exitCode: terminal.exitCode,
            active: tab?.active ?? false,
          };
        });
      ctx.devServers = (this.options.devServers?.list() ?? [])
        .filter(
          (server) =>
            (server.status === "running" || server.status === "starting") &&
            relevantCwds.has(resolve(server.cwd)),
        )
        .map((server) => ({
          id: server.id,
          name: server.name,
          cwd: server.cwd,
          status: server.status,
          command: [server.command, ...server.args].join(" "),
          url: server.port ? `http://localhost:${server.port}` : undefined,
          pid: server.pid,
        }));
    }
    ctx.git = readGitSummary(session.cwd);
    ctx.instructionFiles = readInstructionFiles(session.cwd);
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
    mcpEndpoint?: McpSessionEndpoint,
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

  private async createPreRunCheckpoint(session: AgentSession): Promise<void> {
    if (this.options.appState?.getState().settings.git.checkpointBeforeAgentRun === false)
      return;
    if (!this.registry.has("git_checkpoint_create")) return;
    const result = await this.registry.call(
      {
        cwd: session.cwd,
        caller: "internal",
        sessionId: session.id,
        spaceId: session.spaceId ?? undefined,
      },
      "git_checkpoint_create",
      {
        cwd: session.cwd,
        label: `Before agent run: ${session.title}`,
        source: "agent-run",
        sessionId: session.id,
      },
    );
    if (!result.ok) {
      this.logger.warn(
        "Agent",
        `failed to create pre-run checkpoint: ${result.error?.message ?? "unknown error"}`,
        { sessionId: session.id },
      );
    }
  }

  // --- Run -----------------------------------------------------------------

  /**
   * Run a session through the registered adapter, streaming chunks. If
   * user input is provided it is appended as a user message first. Chunks are
   * also emitted as `chunk` events for the IPC layer; the transcript is
   * persisted as the turn progresses.
   */
  async *run(sessionId: string, input?: AgentRunInput): AsyncIterable<AgentStreamChunk> {
    const session = this.requireSession(sessionId, "full");
    if (!this.adapter) {
      throw new Error(
        "No AgentAdapter registered. Implement AgentAdapter (ACP/MCP/SDK) and call registerAdapter().",
      );
    }
    if (session.status === "running" || this.controllers.has(sessionId)) {
      throw new Error(`Agent session is already running: ${sessionId}`);
    }
    const userInput = normalizeRunInput(input);
    if (userInput) {
      this.appendMessage(sessionId, "user", userInput.text, {
        attachments: userInput.attachments,
      });
      this.applyAutoTitle(session, userInput.titleSeed);
    }
    await this.createPreRunCheckpoint(session);

    const controller = new AbortController();
    this.controllers.set(sessionId, controller);
    this.setStatus(session, "running");

    // Register an MCP endpoint so an external (ACP) agent can call our tools
    // with this session's identity. In-process adapters use host.callTool.
    let mcpEndpoint: McpSessionEndpoint | undefined;
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
      const finalStatus = controller.signal.aborted ? "cancelled" : "idle";
      this.finalizeAssistant(session, assistant, finalStatus);
      this.setStatus(session, finalStatus);
    } catch (err) {
      assistant.error = err instanceof Error ? err.message : String(err);
      this.finalizeAssistant(session, assistant, "error");
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
        appendAssistantText(assistant, chunk.text, chunk.kind);
        this.persistAssistantPatch(session, assistant);
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
        const call = assistant.toolCalls.find((c) => c.id === chunk.toolCall.id);
        this.persistAssistantPatch(session, assistant, {
          toolCalls: call ? [call] : [],
        });
        break;
      }
      case "tool_result": {
        const call = assistant.toolCalls?.find((c) => c.id === chunk.toolCallId);
        if (call) {
          call.result = chunk.result;
          call.status = chunk.result.ok ? "ok" : "error";
          call.endedAt = Date.now();
        }
        this.persistAssistantPatch(session, assistant, {
          toolCalls: call ? [call] : [],
        });
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

  private finalizeAssistant(
    session: AgentSession,
    assistant: AgentMessage,
    outcome: "idle" | "cancelled" | "error",
  ): void {
    // Drop a fully-empty assistant message (e.g. immediate cancel).
    if (
      !assistant.content &&
      (!assistant.toolCalls || assistant.toolCalls.length === 0) &&
      !assistant.error
    ) {
      session.messages = session.messages.filter((m) => m.id !== assistant.id);
      this.persistedAssistantContentLength.delete(assistant.id);
      return;
    }

    const incompleteCalls: AgentToolCall[] = [];
    for (const call of assistant.toolCalls ?? []) {
      if (call.status !== "running" && call.status !== "pending") continue;
      call.status = outcome === "cancelled" ? "cancelled" : "error";
      call.endedAt = Date.now();
      if (!call.result) {
        call.result = errorResult(
          "TOOL_FAILED",
          outcome === "cancelled"
            ? `Tool "${call.name}" was cancelled before a result was received.`
            : `Tool "${call.name}" ended without returning a result.`,
        );
      }
      incompleteCalls.push(call);
    }

    this.persistAssistantPatch(session, assistant, {
      ...(incompleteCalls.length > 0 ? { toolCalls: incompleteCalls } : {}),
      usage: assistant.usage,
      error: assistant.error,
    });
    this.persistedAssistantContentLength.delete(assistant.id);
  }

  private setStatus(session: AgentSession, status: AgentSession["status"]): void {
    session.status = status;
    session.updatedAt = Date.now();
    this.persistMeta(session);
    this.emit("session", this.toMeta(session));
  }

  private persistAssistantPatch(
    session: AgentSession,
    assistant: AgentMessage,
    extras: Partial<Pick<AgentMessagePatch, "toolCalls" | "usage" | "error">> = {},
  ): void {
    const tracked = this.persistedAssistantContentLength.get(assistant.id) ?? 0;
    // Defensive: if tracking ever exceeds the current content length the cursor
    // has desynced (content shorter than what we think we persisted). Slicing at
    // a stale cursor would persist a delta that starts mid-stream, which on
    // reload reconstructs as content chopped mid-token (e.g. inside a markdown
    // link). Reset to 0 so we re-persist the full content instead of a fragment.
    const previousLength =
      tracked > assistant.content.length ? 0 : tracked;
    const contentDelta = assistant.content.slice(previousLength);
    const textSegments = deltaTextSegments(assistant.textSegments, previousLength);
    if (
      !contentDelta &&
      textSegments.length === 0 &&
      !extras.toolCalls?.length &&
      extras.usage === undefined &&
      extras.error === undefined
    ) {
      return;
    }

    const patch: AgentMessagePatch = {
      type: "message_patch",
      messageId: assistant.id,
      role: assistant.role,
      createdAt: assistant.createdAt,
      ...(contentDelta ? { contentDelta } : {}),
      ...(textSegments.length ? { textSegments } : {}),
      ...extras,
    };
    this.options.store?.appendMessagePatch(session.id, patch);
    if (assistant.content.length > previousLength) {
      this.persistedAssistantContentLength.set(assistant.id, assistant.content.length);
    }
  }

  private persistMeta(session: AgentSession): void {
    this.options.store?.upsertMeta(this.toMeta(session));
  }

  private applyAutoTitle(session: AgentSession, userText: string): void {
    if (!isDefaultAgentSessionTitle(session.title)) return;
    const title = summarizeAgentSessionTitle(userText);
    if (!title) return;
    session.title = title;
    session.updatedAt = Date.now();
    this.persistMeta(session);
    this.emit("session", this.toMeta(session));
  }

  private toMeta(session: AgentSession): AgentSessionMeta {
    const { messages: _messages, ...meta } = session;
    return meta;
  }

  private touch(sessionId: string): void {
    this.lastActivity.set(sessionId, Date.now());
  }

  private getOrCreateSessionFromMeta(sessionId: string): AgentSession | undefined {
    const cached = this.sessions.get(sessionId);
    if (cached) return cached;
    const meta = this.options.store?.getMeta(sessionId);
    if (!meta) return undefined;
    const session: AgentSession = { ...meta, messages: [] };
    this.sessions.set(sessionId, session);
    return session;
  }

  private ensureTranscriptLoaded(
    session: AgentSession,
    mode: TranscriptLoadMode,
  ): AgentSession {
    const currentMode = this.transcriptLoadMode.get(session.id);
    const store = this.options.store;
    if (currentMode === "full" && mode === "display") {
      return store
        ? { ...session, messages: store.readDisplayMessagesFast(session.id) }
        : session;
    }
    if (currentMode === mode) return session;
    if (!store) {
      this.transcriptLoadMode.set(session.id, mode);
      return session;
    }

    try {
      const loaded: AgentSession = {
        ...session,
        messages:
          mode === "full"
            ? store.readMessages(session.id)
            : store.readDisplayMessagesFast(session.id),
      };
      this.sessions.set(session.id, loaded);
      this.transcriptLoadMode.set(session.id, mode);
      return loaded;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const failed: AgentSession = { ...session, status: "error", messages: [] };
      this.sessions.set(session.id, failed);
      this.transcriptLoadMode.set(session.id, mode);
      this.logger.warn(
        "Agent",
        `skipped transcript for ${session.id} during lazy load: ${reason}`,
      );
      return failed;
    }
  }

  private requireSession(
    sessionId: string,
    mode: TranscriptLoadMode = "display",
  ): AgentSession {
    const session = this.getOrCreateSessionFromMeta(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    return this.ensureTranscriptLoaded(session, mode);
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

function normalizeRunInput(
  input?: AgentRunInput,
): { text: string; titleSeed: string; attachments?: AgentAttachment[] } | null {
  if (input === undefined) return null;
  if (typeof input === "string") {
    const text = input.trim();
    return text ? { text, titleSeed: text } : null;
  }
  const rawText = input.text?.trim() ?? "";
  const attachments = (input.attachments ?? []).filter((attachment) =>
    Boolean(attachment.path),
  );
  if (!rawText && attachments.length === 0) return null;
  return {
    text: rawText,
    titleSeed: rawText || attachments[0]?.name || "Attachment",
    attachments: attachments.length ? attachments : undefined,
  };
}

function sanitizeAttachmentName(name: string): string {
  const cleaned = [...name]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("")
    .replace(/[/\\]/g, "-")
    .trim();
  if (!cleaned) return "attachment";
  return cleaned.slice(0, 120);
}

function inferAttachmentKind(
  mimeType: string | undefined,
  name: string,
): AgentAttachment["kind"] {
  const mime = mimeType?.toLowerCase() ?? "";
  if (mime.startsWith("image/")) return "image";
  const ext = extname(name).toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"].includes(ext)
    ? "image"
    : "file";
}

const INSTRUCTION_FILE_NAMES = [
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
  ".github/copilot-instructions.md",
] as const;
const MAX_INSTRUCTION_BYTES = 24_000;

function readGitSummary(cwd: string): AgentPromptContext["git"] {
  if (runGit(cwd, ["rev-parse", "--is-inside-work-tree"]) !== "true") {
    return { status: "not a git repository" };
  }
  const branch =
    runGit(cwd, ["branch", "--show-current"]) ||
    runGit(cwd, ["rev-parse", "--short", "HEAD"]);
  const statusText = runGit(cwd, ["status", "--short"]) ?? "";
  const files = statusText
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  return {
    branch,
    status: files.length === 0 ? "clean" : "changes",
    summary:
      files.length === 0 ? "working tree clean" : `${files.length} changed file(s)`,
    files: files.slice(0, 12),
  };
}

function readInstructionFiles(cwd: string): AgentPromptContext["instructionFiles"] {
  const root = runGit(cwd, ["rev-parse", "--show-toplevel"]) || cwd;
  const dirs = instructionSearchDirs(root, cwd);
  const seen = new Set<string>();
  const files: NonNullable<AgentPromptContext["instructionFiles"]> = [];
  for (const dir of dirs) {
    for (const name of INSTRUCTION_FILE_NAMES) {
      const path = resolve(dir, name);
      if (seen.has(path) || !isRegularFile(path)) continue;
      seen.add(path);
      const raw = readFileSync(path);
      const truncated = raw.byteLength > MAX_INSTRUCTION_BYTES;
      const content = raw.subarray(0, MAX_INSTRUCTION_BYTES).toString("utf8").trimEnd();
      files.push({ path, content, truncated });
    }
  }
  return files;
}

function instructionSearchDirs(root: string, cwd: string): string[] {
  const base = resolve(root);
  const current = resolve(cwd);
  const rel = relative(base, current);
  if (rel.startsWith("..") || rel === "" || rel.split(sep).includes("..")) {
    return rel === "" ? [base] : [current];
  }
  const dirs = [base];
  let cursor = base;
  for (const part of rel.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, part);
    dirs.push(cursor);
  }
  return dirs;
}

function isRegularFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function runGit(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 750,
      maxBuffer: 128 * 1024,
    }).trim();
  } catch {
    return undefined;
  }
}

function appendAssistantText(
  assistant: AgentMessage,
  text: string,
  kind: "thought" | "message" = "message",
): void {
  if (!text) return;
  const start = assistant.content.length;
  const end = start + text.length;
  assistant.content += text;
  assistant.textSegments = assistant.textSegments ?? [];

  const startsAfterTool = assistant.toolCalls?.some(
    (call) => call.contentOffset === start,
  );
  const previous = assistant.textSegments.at(-1);
  if (
    previous &&
    previous.end === start &&
    !startsAfterTool &&
    textSegmentKind(previous) === kind
  ) {
    previous.text += text;
    previous.end = end;
    return;
  }
  assistant.textSegments.push(agentTextSegment(start, end, text, kind));
}

function textSegmentKind(segment: NonNullable<AgentMessage["textSegments"]>[number]) {
  return segment.kind ?? "message";
}

function agentTextSegment(
  start: number,
  end: number,
  text: string,
  kind: "thought" | "message",
): NonNullable<AgentMessage["textSegments"]>[number] {
  return kind === "thought" ? { start, end, text, kind } : { start, end, text };
}

function deltaTextSegments(
  segments: AgentMessage["textSegments"],
  fromOffset: number,
): NonNullable<AgentMessage["textSegments"]> {
  if (!segments?.length) return [];
  const delta: NonNullable<AgentMessage["textSegments"]> = [];
  for (const segment of segments) {
    if (segment.end <= fromOffset) continue;
    if (segment.start >= fromOffset) {
      delta.push(segment);
      continue;
    }
    delta.push({
      ...segment,
      start: fromOffset,
      text: segment.text.slice(fromOffset - segment.start),
    });
  }
  return delta;
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
