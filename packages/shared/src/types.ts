import type {
  AppState,
  ToolCapability,
  ToolDiagnostic,
  ToolErrorCode,
  ToolErrorInfo,
  ToolEvent,
} from "./schemas.js";

/**
 * Cross-cutting types that are not themselves validated payloads.
 */

/** Who issued a tool call. Used for auditing and permissioning. */
export type ToolCaller = "renderer" | "cli" | "agent" | "plugin" | "internal";

/** Context passed into every tool's execute(). Extend as services grow. */
export interface ToolContext {
  /** Working directory the call originated from (CLI cwd, agent cwd, etc.). */
  cwd: string;
  /** Where the call came from. Useful for auditing / permissioning. */
  caller: ToolCaller;
  /** Optional logical session identifier (agent session, CLI invocation). */
  sessionId?: string;
  /** Optional space the call is scoped to. */
  spaceId?: string;
  /** Optional browser/workspace tab the call is scoped to. */
  tabId?: string;
  /** Aborts when the caller cancels or the per-call timeout fires. */
  signal?: AbortSignal;
  /** Emit a streaming event (progress/log/partial_text/artifact) to the caller. */
  emit?: (event: ToolEvent) => void;
}

/**
 * The structured envelope every tool call resolves to. Generic over the
 * success `content` type. Mirrors `ToolResultSchema` in `schemas.ts`.
 */
export interface ToolResult<T = unknown> {
  ok: boolean;
  content?: T;
  meta?: Record<string, unknown>;
  diagnostics?: ToolDiagnostic[];
  error?: ToolErrorInfo;
}

/**
 * Throw this from a tool's `execute` to control the resulting error code.
 * Any other thrown error becomes `TOOL_FAILED`.
 */
export class ToolError extends Error {
  readonly code: ToolErrorCode;
  readonly details?: unknown;
  constructor(code: ToolErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ToolError";
    this.code = code;
    this.details = details;
  }
}

/** Build a successful `ToolResult`. */
export function okResult<T>(
  content?: T,
  extra?: { meta?: Record<string, unknown>; diagnostics?: ToolDiagnostic[] },
): ToolResult<T> {
  const result: ToolResult<T> = { ok: true, content };
  if (extra?.meta) result.meta = extra.meta;
  if (extra?.diagnostics) result.diagnostics = extra.diagnostics;
  return result;
}

/** Build a failed `ToolResult`. */
export function errorResult(
  code: ToolErrorCode,
  message: string,
  details?: unknown,
): ToolResult {
  return { ok: false, error: { code, message, details } };
}

/** Runtime guard: did a tool return a full envelope instead of a raw value? */
export function isToolResult(value: unknown): value is ToolResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { ok?: unknown }).ok === "boolean" &&
    !Array.isArray(value)
  );
}

/** Re-export for convenience so callers can `import type { ToolCapability }`. */
export type { ToolCapability };

export function defaultAppState(): AppState {
  return {
    version: 3,
    spaces: [],
    activeSpaceId: null,
    browserTabs: [],
    workspaceTabs: [],
    projects: [],
    workspaceFileEvents: [],
  };
}
