import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import {
  type AgentConfig,
  type AgentConfigOption,
  type AgentMessage,
  type AgentProbeResult,
  type AgentToolCall,
  type ToolResult,
  isModelConfigOption,
  isReasoningConfigOption,
  newToolCallId,
  resolveAcpLaunch,
} from "@meith/shared";
import { withDesktopExecutablePath } from "../../process/executablePath.js";
import type { AgentConfigStore } from "../../services/AgentConfigStore.js";
import type { Logger } from "../../services/Logger.js";
import { AsyncChunkQueue } from "../acp/AsyncChunkQueue.js";
import { JsonRpcClient } from "../acp/JsonRpcClient.js";
import type {
  AgentAdapter,
  AgentHostContext,
  AgentSession,
  AgentStreamChunk,
} from "../types.js";

const ACP_PROTOCOL_VERSION = 1;
const DEFAULT_TEXT_VERBOSITY = "low";

/**
 * Drives an external agent that speaks the Agent Client Protocol (ACP) over a
 * spawned subprocess's stdio. The agent reaches the host's tools through the
 * in-process MCP bridge (passed as an HTTP MCP server on `session/new`), so all
 * tool calls remain gated and attributed to this session.
 *
 * Provider specifics live entirely here; the rest of the runtime only sees the
 * generic `AgentAdapter` interface. When the configured command is missing or
 * the handshake fails, this surfaces an `error` chunk instead of crashing.
 */
export class AcpAdapter implements AgentAdapter {
  readonly id = "acp";
  readonly displayName = "ACP Agent";
  private readonly children = new Map<string, ChildProcessWithoutNullStreams>();

  constructor(
    private readonly config: AgentConfigStore,
    private readonly logger?: Logger,
  ) {}

  private log(message: string): void {
    this.logger?.info("Agent", message);
  }

  async *run(
    session: AgentSession,
    host: AgentHostContext,
  ): AsyncIterable<AgentStreamChunk> {
    const cfg = this.config.get();
    // A built-in preset supplies its own command/args; `custom` uses the
    // user-provided command. Resolve once so the rest of the method is agnostic.
    const launch = resolveAcpLaunch(cfg);
    if (!launch.command) {
      yield {
        type: "error",
        message:
          "No ACP agent configured. Pick a built-in agent (Claude/Codex) or set a custom command in Settings.",
      };
      yield { type: "done" };
      return;
    }
    const model = session.model || cfg.model;
    const reasoning = session.reasoning || cfg.reasoning;

    const queue = new AsyncChunkQueue();
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(launch.command, launch.args, {
        cwd: host.cwd,
        env: withDesktopExecutablePath({
          ...process.env,
          ...(model ? { ACP_MODEL: model } : {}),
        }),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      yield {
        type: "error",
        message: `Failed to spawn ACP agent "${launch.command}": ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
      yield { type: "done" };
      return;
    }
    this.children.set(session.id, child);

    const rpc = new JsonRpcClient({
      write: (data) => child.stdin.write(data),
      onData: (cb) => child.stdout.on("data", cb),
    });

    child.stderr.on("data", (d: Buffer) => this.log(`[acp] ${d.toString().trim()}`));
    child.on("error", (err) => {
      rpc.close(err.message);
      queue.push({ type: "error", message: `ACP agent error: ${err.message}` });
      queue.end();
    });
    child.on("exit", (code) => {
      rpc.close(`agent exited (${code ?? "?"})`);
      queue.end();
    });

    const meithToolNames = new Set(host.listTools().map((tool) => tool.name));
    const meithToolCallIds = new Set<string>();
    // The ACP peer can ask the client to approve provider-side tools. Meith
    // tools are exposed through the MCP server named "meith"; everything else
    // must be denied so provider-native helpers cannot bypass the registry.
    rpc.onRequest((method, params) => {
      if (method === "session/request_permission") {
        return {
          outcome: {
            outcome: "selected",
            optionId: selectAcpPermissionOption(params, meithToolNames, meithToolCallIds),
          },
        };
      }
      throw new Error(`Unhandled request: ${method}`);
    });

    rpc.on("notification", (method: string, params: unknown) => {
      if (method === "session/update") {
        const toolCallId = extractMeithToolCallId(params, meithToolNames);
        if (toolCallId) meithToolCallIds.add(toolCallId);
        const chunk = mapSessionUpdate(params);
        if (chunk) queue.push(chunk);
      }
    });

    // Cancel cleanly when the user presses Stop.
    const onAbort = () => {
      rpc.notify("session/cancel", { sessionId: currentSessionId });
      this.kill(session.id);
      queue.end();
    };
    host.signal.addEventListener("abort", onAbort, { once: true });

    let currentSessionId = "";
    // Run the ACP handshake + prompt in the background, feeding the queue.
    void (async () => {
      try {
        const initializeResponse = await rpc.request("initialize", {
          protocolVersion: ACP_PROTOCOL_VERSION,
          clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
        });
        if (host.mcpEndpoint && !supportsHttpMcp(initializeResponse)) {
          throw new Error(
            "Configured ACP agent does not advertise HTTP MCP support, so Meith tools cannot be exposed.",
          );
        }

        const mcpServers = host.mcpEndpoint
          ? [
              {
                type: "http",
                name: "meith",
                url: host.mcpEndpoint.url,
                headers: [
                  { name: "Authorization", value: `Bearer ${host.mcpEndpoint.token}` },
                ],
              },
            ]
          : [];

        const newSession = (await rpc.request("session/new", {
          cwd: host.cwd,
          mcpServers,
        })) as { sessionId?: string; configOptions?: unknown };
        currentSessionId = newSession.sessionId ?? "";

        // Apply the chosen model / reasoning level through the stable config
        // options framework (the experimental session/set_model was removed).
        await applyConfigOptions(
          rpc,
          currentSessionId,
          parseAcpConfigOptions(newSession.configOptions),
          { model, reasoning },
          (msg) => this.log(`[acp] ${msg}`),
        );

        if (host.mcpEndpoint && shouldWaitForMcpToolsExposure(cfg, launch)) {
          await waitForMcpToolsExposed(host.mcpEndpoint.ready);
        }

        await rpc.request("session/prompt", {
          sessionId: currentSessionId,
          prompt: buildAcpPrompt(host.systemPrompt(), session.messages),
        });
        queue.end();
      } catch (err) {
        queue.push({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
        queue.end();
      }
    })();

    try {
      for await (const chunk of queue) {
        yield chunk;
      }
    } finally {
      host.signal.removeEventListener("abort", onAbort);
      this.kill(session.id);
    }
    yield { type: "done" };
  }

  private kill(sessionId: string): void {
    const child = this.children.get(sessionId);
    if (child && !child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        // already gone
      }
    }
    this.children.delete(sessionId);
  }

  dispose(sessionId: string): void {
    this.kill(sessionId);
  }

  /**
   * Launch the configured agent, run the ACP handshake (`initialize` +
   * `session/new`) and read back its advertised config options, then tear the
   * subprocess down. Doubles as an install check: a spawn failure or handshake
   * timeout means the agent isn't available. Never throws — failures are
   * reported on the returned result so the UI can surface them inline.
   */
  async probe(
    override?: Partial<Pick<AgentConfig, "acpPreset" | "command" | "args">>,
    timeoutMs = 30_000,
  ): Promise<AgentProbeResult> {
    const cfg = { ...this.config.get(), ...override };
    const preset = cfg.acpPreset ?? "custom";
    const launch = resolveAcpLaunch(cfg);
    if (!launch.command) {
      return {
        preset,
        installed: false,
        error: "No command configured. Pick Claude or Codex, or set a custom command.",
        options: [],
      };
    }

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(launch.command, launch.args, {
        cwd: process.cwd(),
        env: withDesktopExecutablePath({ ...process.env }),
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      return {
        preset,
        installed: false,
        error: `Failed to launch "${launch.command}": ${
          err instanceof Error ? err.message : String(err)
        }`,
        options: [],
      };
    }

    const rpc = new JsonRpcClient({
      write: (data) => child.stdin.write(data),
      onData: (cb) => child.stdout.on("data", cb),
    });
    // The agent never needs to call the host during a probe; deny everything.
    rpc.onRequest(() => {
      throw new Error("probe: unsupported request");
    });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    const cleanup = () => {
      rpc.close("probe complete");
      if (!child.killed) {
        try {
          child.kill("SIGTERM");
        } catch {
          // already gone
        }
      }
    };

    try {
      const handshake = (async (): Promise<AgentConfigOption[]> => {
        await rpc.request("initialize", {
          protocolVersion: ACP_PROTOCOL_VERSION,
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
          },
        });
        const newSession = (await rpc.request("session/new", {
          cwd: process.cwd(),
          mcpServers: [],
        })) as { configOptions?: unknown };
        return parseAcpConfigOptions(newSession.configOptions);
      })();

      const spawnFailure = new Promise<never>((_, reject) => {
        child.on("error", (err) => reject(err));
        child.on("exit", (code) =>
          reject(new Error(`agent exited before handshake (code ${code ?? "?"})`)),
        );
      });
      const timeout = new Promise<never>((_, reject) => {
        const t = setTimeout(
          () => reject(new Error(`handshake timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
        t.unref?.();
      });

      const options = await Promise.race([handshake, spawnFailure, timeout]);
      return { preset, installed: true, options };
    } catch (err) {
      const base = err instanceof Error ? err.message : String(err);
      const detail = stderr.trim().split("\n").slice(-3).join("\n");
      return {
        preset,
        installed: false,
        error: detail ? `${base}\n${detail}` : base,
        options: [],
      };
    } finally {
      cleanup();
    }
  }
}

export function buildAcpPrompt(
  systemPrompt: string,
  transcript: AgentMessage[] | string,
): Array<{ type: "text"; text: string }> {
  const system = systemPrompt.trim();
  const rendered = renderTranscript(transcript);
  const text = [
    "Host system instructions from Meith. Follow these instructions and the tool catalog before responding:",
    "",
    system,
    "",
    rendered.history ? "Conversation so far:" : "",
    rendered.history,
    rendered.history ? "" : "",
    "Current user request:",
    rendered.currentUser,
  ].join("\n");
  return [{ type: "text", text }];
}

export function supportsHttpMcp(initializeResponse: unknown): boolean {
  const response = asRecord(initializeResponse);
  const capabilities = asRecord(response?.agentCapabilities);
  const mcpCapabilities = asRecord(capabilities?.mcpCapabilities);
  return mcpCapabilities?.http === true;
}

export function shouldWaitForMcpToolsExposure(
  config: Pick<AgentConfig, "acpPreset">,
  launch: { command: string; args: string[] },
): boolean {
  const preset = config.acpPreset ?? "custom";
  if (preset === "codex" || preset === "claude") return true;
  const launchText = [launch.command, ...launch.args].join(" ").toLowerCase();
  return launchText.includes("codex-acp") || launchText.includes("claude-agent-acp");
}

export async function waitForMcpToolsExposed(
  ready: Promise<void>,
  timeoutMs = 10_000,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `Meith MCP tools were not exposed to the ACP agent within ${timeoutMs}ms. The agent did not call tools/list on the per-session Meith MCP bridge.`,
        ),
      );
    }, timeoutMs);
    timer.unref?.();
  });
  try {
    await Promise.race([ready, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Normalise the `configOptions` an agent returns from `session/new` into the
 * shared `AgentConfigOption` shape. Tolerant of missing/extra fields and of the
 * `options: [{ value, name }]` vs `values` naming so different agents parse.
 */
export function parseAcpConfigOptions(raw: unknown): AgentConfigOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const record = asRecord(entry);
    const id = stringValue(record?.id) ?? stringValue(record?.configId);
    if (!record || !id) return [];
    const rawValues = Array.isArray(record.options)
      ? record.options
      : Array.isArray(record.values)
        ? record.values
        : [];
    const values = rawValues.flatMap((value) => {
      const v = asRecord(value);
      const val = stringValue(v?.value) ?? stringValue(v?.id);
      if (!v || !val) return [];
      return [{ value: val, name: stringValue(v.name) ?? val }];
    });
    const type = record.type === "boolean" ? "boolean" : "select";
    return [
      {
        id,
        name: stringValue(record.name) ?? id,
        category: stringValue(record.category),
        type: type as AgentConfigOption["type"],
        currentValue:
          stringValue(record.currentValue) ?? stringValue(record.value) ?? undefined,
        values,
      },
    ];
  });
}

/**
 * Apply the chosen model / reasoning level to an open ACP session via
 * `session/set_config_option`, matching the desired values against the agent's
 * advertised options. Best-effort: unknown values or set failures are logged
 * and skipped so a bad selection never aborts the turn.
 */
export async function applyConfigOptions(
  rpc: JsonRpcClient,
  sessionId: string,
  options: AgentConfigOption[],
  desired: { model?: string; reasoning?: string },
  log?: (message: string) => void,
): Promise<void> {
  const set = async (option: AgentConfigOption, want: string) => {
    if (!want) return;
    // Match by exact value, then case-insensitive value/name (so "high" maps to
    // a "High" label or a "reasoning-high" value).
    const match =
      option.values.find((v) => v.value === want) ??
      option.values.find(
        (v) =>
          v.value.toLowerCase() === want.toLowerCase() ||
          v.name.toLowerCase() === want.toLowerCase(),
      );
    const value = match?.value ?? want;
    if (option.currentValue === value) return;
    try {
      await rpc.request("session/set_config_option", {
        sessionId,
        configId: option.id,
        value,
      });
    } catch (err) {
      log?.(
        `set_config_option ${option.id}=${value} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  };

  const modelOption = options.find((o) => isModelConfigOption(o));
  if (modelOption && desired.model) await set(modelOption, desired.model);

  const reasoningOption = options.find((o) => isReasoningConfigOption(o));
  if (reasoningOption && desired.reasoning) await set(reasoningOption, desired.reasoning);

  const verbosityOption = options.find((o) => isTextVerbosityConfigOption(o));
  if (verbosityOption) await set(verbosityOption, DEFAULT_TEXT_VERBOSITY);
}

interface AcpPermissionOption {
  optionId: string;
  kind?: string;
  name?: string;
  label?: string;
  description?: string;
}

export function selectAcpPermissionOption(
  params: unknown,
  meithToolNames: ReadonlySet<string>,
  meithToolCallIds: ReadonlySet<string> = new Set(),
): string {
  const request = asRecord(params);
  const options = toPermissionOptions(request?.options);
  const allow = findPermissionOption(options, ["allow", "approve", "yes"]);
  const deny = findPermissionOption(options, [
    "deny",
    "reject",
    "cancel",
    "no",
    "disallow",
  ]);

  if (isMeithPermissionRequest(params, meithToolNames, meithToolCallIds)) {
    if (allow) return allow.optionId;
    throw new Error("ACP permission request for a Meith tool had no allow option");
  }

  if (deny) return deny.optionId;
  throw new Error("Denied non-Meith ACP tool request without a deny option");
}

function toPermissionOptions(value: unknown): AcpPermissionOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option) => {
    const record = asRecord(option);
    if (!record || typeof record.optionId !== "string") return [];
    return [
      {
        optionId: record.optionId,
        kind: stringValue(record.kind),
        name: stringValue(record.name),
        label: stringValue(record.label),
        description: stringValue(record.description),
      },
    ];
  });
}

function findPermissionOption(
  options: readonly AcpPermissionOption[],
  needles: readonly string[],
): AcpPermissionOption | undefined {
  return options.find((option) => {
    const tokens = [
      option.optionId,
      option.kind,
      option.name,
      option.label,
      option.description,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter(Boolean);
    return needles.some((needle) => tokens.includes(needle));
  });
}

function isMeithPermissionRequest(
  params: unknown,
  meithToolNames: ReadonlySet<string>,
  meithToolCallIds: ReadonlySet<string> = new Set(),
): boolean {
  if (hasKnownMeithToolCallId(params, meithToolCallIds)) return true;
  const names = collectStrings(params)
    .map((value) => value.trim())
    .filter(Boolean);
  return names.some((name) => isMeithToolName(name, meithToolNames));
}

function isMeithToolName(name: string, meithToolNames: ReadonlySet<string>): boolean {
  if (meithToolNames.has(name)) return true;
  if (name.startsWith("meith.")) return meithToolNames.has(name.slice("meith.".length));
  if (name.startsWith("meith/")) return meithToolNames.has(name.slice("meith/".length));
  if (name.startsWith("mcp.meith.")) {
    return meithToolNames.has(name.slice("mcp.meith.".length));
  }
  if (name.startsWith("mcp/meith/")) {
    return meithToolNames.has(name.slice("mcp/meith/".length));
  }
  if (name.startsWith("mcp__meith.")) {
    return meithToolNames.has(name.slice("mcp__meith.".length));
  }
  if (name.startsWith("mcp__meith__")) {
    return meithToolNames.has(name.slice("mcp__meith__".length));
  }
  return false;
}

export function extractMeithToolCallId(
  params: unknown,
  meithToolNames: ReadonlySet<string>,
): string | null {
  const outer = asRecord(params);
  const update = asRecord(outer?.update);
  if (!update) return null;
  const kind = update.sessionUpdate;
  if (kind !== "tool_call" && kind !== "tool_call_update") return null;
  const id = stringValue(update.toolCallId);
  if (!id) return null;
  return isMeithPermissionRequest(update, meithToolNames) ? id : null;
}

function hasKnownMeithToolCallId(
  value: unknown,
  meithToolCallIds: ReadonlySet<string>,
  seen = new WeakSet<object>(),
): boolean {
  if (meithToolCallIds.size === 0 || !value || typeof value !== "object") {
    return false;
  }
  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => hasKnownMeithToolCallId(item, meithToolCallIds, seen));
  }

  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (
      (key === "toolCallId" || key === "tool_call_id" || key === "callId") &&
      typeof child === "string" &&
      meithToolCallIds.has(child)
    ) {
      return true;
    }
    if (hasKnownMeithToolCallId(child, meithToolCallIds, seen)) return true;
  }
  return false;
}

function collectStrings(value: unknown, seen = new WeakSet<object>()): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item, seen));
  }

  return Object.values(value).flatMap((item) => collectStrings(item, seen));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function renderTranscript(transcript: AgentMessage[] | string): {
  history: string;
  currentUser: string;
} {
  if (typeof transcript === "string") {
    return { history: "", currentUser: transcript.trim() };
  }

  const messages = transcript.filter((message) => {
    if (message.role === "assistant" && !message.content.trim() && !message.error) {
      return Boolean(message.toolCalls?.length);
    }
    return Boolean(message.content.trim() || message.error || message.toolCalls?.length);
  });
  const currentUserIndex = findLastUserIndex(messages);
  if (currentUserIndex < 0) {
    return { history: formatMessagesForPrompt(messages), currentUser: "" };
  }
  return {
    history: formatMessagesForPrompt(messages.slice(0, currentUserIndex)),
    currentUser: messages[currentUserIndex]?.content.trim() ?? "",
  };
}

function findLastUserIndex(messages: AgentMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") return i;
  }
  return -1;
}

function formatMessagesForPrompt(messages: AgentMessage[]): string {
  return messages
    .map((message) => {
      const role = message.role.toUpperCase();
      const parts: string[] = [];
      const content = message.content.trim();
      if (content) parts.push(content);
      if (message.error) parts.push(`[error: ${message.error}]`);
      if (message.toolCalls?.length) {
        const calls = message.toolCalls
          .map((call) => `${call.name} (${call.status})`)
          .join(", ");
        parts.push(`[tool calls: ${calls}]`);
      }
      return `${role}: ${parts.join("\n")}`;
    })
    .join("\n\n");
}

/** Map an ACP `session/update` notification payload to an AgentStreamChunk. */
export function mapSessionUpdate(params: unknown): AgentStreamChunk | null {
  const update = (params as { update?: Record<string, unknown> }).update;
  if (!update || typeof update !== "object") return null;
  const kind = update.sessionUpdate as string | undefined;

  switch (kind) {
    case "agent_message_chunk":
    case "agent_thought_chunk": {
      const text = extractText(update.content) ?? extractText(update.delta);
      if (text) {
        return {
          type: "text",
          text,
          kind: kind === "agent_thought_chunk" ? "thought" : "message",
        };
      }
      return null;
    }
    case "agent_message":
    case "assistant_message":
    case "assistant_item":
    case "assistant_item_replay": {
      const text =
        extractText(update.content) ??
        extractText(update.message) ??
        extractText(update.item) ??
        extractText(update.delta);
      if (text) return { type: "text", text };
      return null;
    }
    case "phase":
    case "preamble":
    case "agent_phase":
    case "agent_preamble": {
      return null;
    }
    case "tool_call": {
      const status = update.status as string | undefined;
      const toolCall: AgentToolCall = {
        id: (update.toolCallId as string) ?? newToolCallId(),
        name: extractToolName(update),
        args: extractToolArgs(update),
        status: mapToolStatus(status),
        result: extractToolResult(update),
        startedAt: Date.now(),
        endedAt: isTerminalToolStatus(status) ? Date.now() : undefined,
      };
      return { type: "tool_call", toolCall };
    }
    case "tool_call_update": {
      const status = update.status as string | undefined;
      const id = update.toolCallId as string | undefined;
      if (!id) return null;
      const toolCall: AgentToolCall = {
        id,
        name: extractToolName(update),
        args: extractToolArgs(update),
        status: mapToolStatus(status),
        result: extractToolResult(update),
        startedAt: Date.now(),
        endedAt: isTerminalToolStatus(status) ? Date.now() : undefined,
      };
      return { type: "tool_call", toolCall };
    }
    default:
      return null;
  }
}

function mapToolStatus(status: string | undefined): AgentToolCall["status"] {
  switch (status) {
    case "completed":
    case "ok":
    case "success":
      return "ok";
    case "failed":
    case "error":
      return "error";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "pending":
      return "pending";
    default:
      return "running";
  }
}

function isTerminalToolStatus(status: string | undefined): boolean {
  const mapped = mapToolStatus(status);
  return mapped === "ok" || mapped === "error" || mapped === "cancelled";
}

function extractToolName(update: Record<string, unknown>): string {
  const rawInput = asRecord(update.rawInput);
  const nestedTool = asRecord(update.toolCall) ?? asRecord(update.tool);
  const candidates = [
    update.title,
    update.toolName,
    update.name,
    nestedTool?.title,
    nestedTool?.toolName,
    nestedTool?.name,
    rawInput?.toolName,
    rawInput?.tool,
    rawInput?.name,
    rawInput?.command,
    update.kind,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  return "tool";
}

function extractToolArgs(update: Record<string, unknown>): Record<string, unknown> {
  const rawInput = asRecord(update.rawInput);
  if (rawInput) return rawInput;
  const input =
    asRecord(update.input) ?? asRecord(update.args) ?? asRecord(update.arguments);
  return input ?? {};
}

function extractToolResult(update: Record<string, unknown>): ToolResult | undefined {
  const status = update.status as string | undefined;
  const output =
    update.rawOutput ?? update.output ?? update.result ?? update.content ?? update.error;
  if (output === undefined) return undefined;

  const result = asRecord(output);
  if (typeof result?.ok === "boolean") return result as unknown as ToolResult;

  const ok = mapToolStatus(status) !== "error";
  if (!ok) {
    return {
      ok: false,
      error: {
        code: "TOOL_FAILED",
        message: typeof output === "string" ? output : safeJson(output),
      },
    };
  }
  return { ok: true, content: output };
}

function isTextVerbosityConfigOption(option: {
  id: string;
  name: string;
  category?: string;
}): boolean {
  const haystack = `${option.category ?? ""} ${option.id} ${option.name}`.toLowerCase();
  return (
    haystack.includes("text.verbosity") ||
    (haystack.includes("verbosity") && haystack.includes("text"))
  );
}

function extractText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  if (!record) return undefined;
  if (typeof record.text === "string") return record.text;
  if (typeof record.delta === "string") return record.delta;
  if (typeof record.content === "string") return record.content;
  if (Array.isArray(record.content)) {
    return record.content.map(extractText).filter(Boolean).join("");
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
