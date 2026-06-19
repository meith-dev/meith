import type { ToolDefinition, ToolDescriptor } from "@meith/protocol";
import {
  DEFAULT_TOOL_TIMEOUT_MS,
  type ToolContext,
  ToolError,
  type ToolErrorCode,
  type ToolEvent,
  type ToolResult,
  createId,
  errorResult,
  isToolResult,
  okResult,
} from "@meith/shared";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Logger } from "../services/Logger.js";

/** Options accepted per call so transports can pass timeout/cancellation/streaming. */
export interface CallOptions {
  /** Per-call timeout override (ms). Falls back to tool.timeoutMs, then default. */
  timeoutMs?: number;
  /** Caller-controlled cancellation. Merged with the internal timeout signal. */
  signal?: AbortSignal;
  /** Stream events (progress/log/partial_text/artifact) back to the caller. */
  emit?: (event: ToolEvent) => void;
}

export interface ToolPermissionService {
  authorize: (
    ctx: Omit<ToolContext, "signal" | "emit">,
    tool: ToolDefinition,
    args: unknown,
  ) => ToolResult | null;
  auditToolCall: (input: {
    ctx: Omit<ToolContext, "signal" | "emit">;
    toolName: string;
    capabilities?: ToolDefinition["capabilities"];
    args: unknown;
    result: ToolResult;
    durationMs: number;
  }) => void;
}

/**
 * The single tool registry. Every caller — CLI (via socket), renderer/debug UI
 * (via IPC), future MCP server, and future AI agent runtime — goes through this
 * same object. The registry owns cross-cutting concerns so individual tools stay
 * simple: input validation, per-call timeout, cancellation wiring, and
 * normalizing every outcome into a structured `ToolResult` envelope.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private shuttingDown = false;

  constructor(
    private readonly permissions?: ToolPermissionService,
    private readonly logger?: Logger,
  ) {}

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  registerAll(tools: ToolDefinition[]): void {
    for (const t of tools) this.register(t);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Reject new calls during shutdown so in-flight work can drain cleanly. */
  beginShutdown(): void {
    this.shuttingDown = true;
  }

  /** Serializable list for `list_tools` / agent function definitions. */
  describe(): ToolDescriptor[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      capabilities: tool.capabilities ?? [],
      inputSchema: zodToJsonSchema(tool.inputSchema, {
        $refStrategy: "none",
      }) as Record<string, unknown>,
    }));
  }

  /**
   * Validate input, apply timeout + cancellation, run the tool, and normalize
   * the outcome into a `ToolResult`. This never throws for tool-level problems —
   * failures come back as `{ ok: false, error }` so every transport can relay
   * them uniformly.
   */
  async call(
    ctx: Omit<ToolContext, "signal" | "emit">,
    name: string,
    args: Record<string, unknown>,
    opts: CallOptions = {},
  ): Promise<ToolResult> {
    const startedAt = Date.now();
    const correlationId = ctx.correlationId ?? ctx.requestId ?? createId("corr");
    const logContext = {
      correlationId,
      requestId: ctx.requestId,
      caller: ctx.caller,
      sessionId: ctx.sessionId,
      toolName: name,
      spaceId: ctx.spaceId,
      tabId: ctx.tabId,
    };
    const audit = (result: ToolResult, tool?: ToolDefinition, auditArgs = args) => {
      const durationMs = Date.now() - startedAt;
      this.logger?.log(
        result.ok ? "debug" : "warn",
        "ToolRegistry",
        `${name} ${result.ok ? "ok" : (result.error?.code ?? "failed")} (${durationMs}ms)`,
        logContext,
      );
      this.permissions?.auditToolCall({
        ctx,
        toolName: name,
        capabilities: tool?.capabilities ?? [],
        args: auditArgs,
        result,
        durationMs,
      });
      return result;
    };

    this.logger?.debug("ToolRegistry", `${name} start`, logContext);

    if (this.shuttingDown) {
      return audit(errorResult("RUNTIME_SHUTTING_DOWN", "Runtime is shutting down"));
    }

    const tool = this.tools.get(name);
    if (!tool) {
      return audit(errorResult("UNKNOWN_TOOL", `Unknown tool: ${name}`));
    }

    const parsed = tool.inputSchema.safeParse(args ?? {});
    if (!parsed.success) {
      return audit(
        errorResult(
          "VALIDATION_ERROR",
          `Invalid arguments for "${name}"`,
          parsed.error.flatten(),
        ),
        tool,
      );
    }

    const denied = this.permissions?.authorize(ctx, tool, parsed.data);
    if (denied) {
      return audit(denied, tool, parsed.data);
    }

    const timeoutMs = opts.timeoutMs ?? tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
    const signal = mergeSignals(opts.signal, timeoutController.signal);

    const fullCtx: ToolContext = { ...ctx, signal, emit: opts.emit };

    try {
      // Race execution against the merged abort signal so a tool that ignores
      // `ctx.signal` is still bounded by the timeout / caller cancellation.
      const raw = await Promise.race([
        Promise.resolve(tool.execute(fullCtx, parsed.data)),
        abortPromise(signal),
      ]);
      return audit(isToolResult(raw) ? raw : okResult(raw), tool, parsed.data);
    } catch (err) {
      if (timeoutController.signal.aborted) {
        return audit(
          errorResult("TIMEOUT", `Tool "${name}" timed out after ${timeoutMs}ms`),
          tool,
          parsed.data,
        );
      }
      if (opts.signal?.aborted) {
        return audit(
          errorResult("CANCELLED", `Tool "${name}" was cancelled`),
          tool,
          parsed.data,
        );
      }
      if (err instanceof ToolError) {
        return audit(
          errorResult(err.code as ToolErrorCode, err.message, err.details),
          tool,
          parsed.data,
        );
      }
      return audit(
        errorResult("TOOL_FAILED", err instanceof Error ? err.message : String(err)),
        tool,
        parsed.data,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

/** A promise that never resolves but rejects as soon as `signal` aborts. */
function abortPromise(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("aborted"));
      return;
    }
    signal.addEventListener("abort", () => reject(new Error("aborted")), {
      once: true,
    });
  });
}

/** Combine optional signals into one that aborts when either does. */
function mergeSignals(a: AbortSignal | undefined, b: AbortSignal): AbortSignal {
  if (!a) return b;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (a.aborted || b.aborted) controller.abort();
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}
