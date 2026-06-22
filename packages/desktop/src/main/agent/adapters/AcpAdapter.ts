import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import {
  type AgentMessage,
  type AgentToolCall,
  type ToolResult,
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
    const model = session.model ?? cfg.model;

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
    // The ACP peer can ask the client to approve provider-side tools. Meith
    // tools are exposed through the MCP server named "meith"; everything else
    // must be denied so provider-native helpers cannot bypass the registry.
    rpc.onRequest((method, params) => {
      if (method === "session/request_permission") {
        return {
          outcome: {
            outcome: "selected",
            optionId: selectAcpPermissionOption(params, meithToolNames),
          },
        };
      }
      throw new Error(`Unhandled request: ${method}`);
    });

    rpc.on("notification", (method: string, params: unknown) => {
      if (method === "session/update") {
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
        await rpc.request("initialize", {
          protocolVersion: ACP_PROTOCOL_VERSION,
          clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
        });

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
        })) as { sessionId?: string };
        currentSessionId = newSession.sessionId ?? "";

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

  if (isMeithPermissionRequest(params, meithToolNames)) {
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
    const haystack = [
      option.optionId,
      option.kind,
      option.name,
      option.label,
      option.description,
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .toLowerCase();
    return needles.some((needle) => haystack.includes(needle));
  });
}

function isMeithPermissionRequest(
  params: unknown,
  meithToolNames: ReadonlySet<string>,
): boolean {
  const names = collectStrings(params)
    .map((value) => value.trim())
    .filter(Boolean);
  return names.some((name) => isMeithToolName(name, meithToolNames));
}

function isMeithToolName(name: string, meithToolNames: ReadonlySet<string>): boolean {
  if (meithToolNames.has(name)) return true;
  if (name.startsWith("meith.")) return meithToolNames.has(name.slice("meith.".length));
  if (name.startsWith("meith/")) return meithToolNames.has(name.slice("meith/".length));
  if (name.startsWith("mcp__meith__")) {
    return meithToolNames.has(name.slice("mcp__meith__".length));
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
function mapSessionUpdate(params: unknown): AgentStreamChunk | null {
  const update = (params as { update?: Record<string, unknown> }).update;
  if (!update || typeof update !== "object") return null;
  const kind = update.sessionUpdate as string | undefined;

  switch (kind) {
    case "agent_message_chunk":
    case "agent_thought_chunk": {
      const content = update.content as { text?: string } | undefined;
      if (content?.text) return { type: "text", text: content.text };
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
