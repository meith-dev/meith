import type { ToolDefinition } from "@meith/protocol";
import { createId, errorResult } from "@meith/shared";
import type { ToolCapability, ToolContext, ToolResult } from "@meith/shared";
import { JsonlStore } from "../storage/JsonlStore.js";
import type { Logger } from "./Logger.js";

const PRIVILEGED_CAPABILITIES: ReadonlySet<ToolCapability> = new Set([
  "writes-files",
  "controls-browser",
  "starts-process",
  "destructive",
]);

const SECRET_KEY_RE =
  /(?:token|password|passwd|secret|api[_-]?key|authorization|credential|private[_-]?key|access[_-]?key)/i;
const LARGE_TEXT_KEY_RE = /^(?:content|data|body|source|newText|text)$/i;
const MAX_SUMMARY_CHARS = 2_000;
const MAX_STRING_CHARS = 240;

export interface AuditEntry {
  id: string;
  ts: number;
  caller: ToolContext["caller"];
  toolName: string;
  capabilities: ToolCapability[];
  decision: "allow" | "deny";
  cwd: string;
  sessionId?: string;
  spaceId?: string;
  tabId?: string;
  argsSummary: string;
  resultSummary: string;
  durationMs: number;
}

interface Grant {
  caller: ToolContext["caller"];
  sessionId: string;
  toolName?: string;
  capabilities: ToolCapability[];
  remainingUses?: number;
}

export interface PermissionServiceOptions {
  auditPath: string;
  logger: Logger;
  getPluginGrants?: (pluginId: string) => ToolCapability[] | null | undefined;
}

export interface GrantInput {
  caller: ToolContext["caller"];
  sessionId: string;
  capabilities: ToolCapability[];
  toolName?: string;
  uses?: number;
}

/**
 * Central authorization + audit service for tool calls.
 *
 * Policy:
 * - `renderer` and `internal` are trusted in-process callers, but still audited.
 * - `cli` callers may run read-only/network-only tools. Privileged capabilities
 *   require an explicit per-session grant.
 * - `agent` callers use the same per-session grant path; AgentService owns the
 *   user prompt and writes grants here before calling the registry.
 * - `plugin` callers must map to an enabled plugin and have every declared tool
 *   capability approved in the plugin grants.
 */
export class PermissionService {
  private readonly audit: JsonlStore<AuditEntry>;
  private readonly grants = new Map<string, Grant[]>();

  constructor(private readonly options: PermissionServiceOptions) {
    this.audit = new JsonlStore<AuditEntry>({
      path: options.auditPath,
      parse: (raw) => (isAuditEntry(raw) ? raw : null),
      maxRecords: 20_000,
    });
  }

  grant(input: GrantInput): void {
    if (!input.sessionId) return;
    const grant: Grant = {
      caller: input.caller,
      sessionId: input.sessionId,
      toolName: input.toolName,
      capabilities: input.capabilities,
      remainingUses: input.uses,
    };
    const key = grantKey(input.caller, input.sessionId);
    const list = this.grants.get(key) ?? [];
    list.push(grant);
    this.grants.set(key, list);
  }

  revokeSession(caller: ToolContext["caller"], sessionId: string): void {
    this.grants.delete(grantKey(caller, sessionId));
  }

  authorize(
    ctx: Omit<ToolContext, "signal" | "emit">,
    tool: ToolDefinition,
  ): ToolResult | null {
    const capabilities = tool.capabilities ?? [];
    const privileged = capabilities.filter((cap) => PRIVILEGED_CAPABILITIES.has(cap));
    if (privileged.length === 0) return null;

    if (ctx.caller === "renderer" || ctx.caller === "internal") return null;

    if (ctx.caller === "plugin") {
      const pluginId = pluginIdFromSession(ctx.sessionId);
      const approved = pluginId ? this.options.getPluginGrants?.(pluginId) : null;
      if (!pluginId || !approved) {
        return errorResult(
          "PERMISSION_DENIED",
          `Plugin caller is not bound to an approved plugin identity for "${tool.name}".`,
        );
      }
      const missing = capabilities.filter((cap) => !approved.includes(cap));
      if (missing.length > 0) {
        return errorResult(
          "PERMISSION_DENIED",
          `Plugin ${pluginId} lacks capabilities [${missing.join(", ")}] required by "${tool.name}".`,
        );
      }
      return null;
    }

    if (!ctx.sessionId) {
      return errorResult(
        "PERMISSION_DENIED",
        `Tool "${tool.name}" requires ${privileged.join(", ")} permission.`,
      );
    }

    if (this.consumeGrant(ctx.caller, ctx.sessionId, tool.name, privileged)) {
      return null;
    }

    return errorResult(
      "PERMISSION_DENIED",
      `Tool "${tool.name}" requires ${privileged.join(", ")} permission.`,
    );
  }

  auditToolCall(input: {
    ctx: Omit<ToolContext, "signal" | "emit">;
    toolName: string;
    capabilities?: ToolCapability[];
    args: unknown;
    result: ToolResult;
    durationMs: number;
  }): void {
    const entry: AuditEntry = {
      id: createId("audit"),
      ts: Date.now(),
      caller: input.ctx.caller,
      toolName: input.toolName,
      capabilities: input.capabilities ?? [],
      decision: input.result.error?.code === "PERMISSION_DENIED" ? "deny" : "allow",
      cwd: input.ctx.cwd,
      sessionId: input.ctx.sessionId,
      spaceId: input.ctx.spaceId,
      tabId: input.ctx.tabId,
      argsSummary: summarizePayload(input.args),
      resultSummary: summarizePayload(input.result),
      durationMs: input.durationMs,
    };
    this.audit.append(entry);
  }

  listAudit(limit?: number): AuditEntry[] {
    return this.audit.tail(limit ?? 200);
  }

  private consumeGrant(
    caller: ToolContext["caller"],
    sessionId: string,
    toolName: string,
    capabilities: ToolCapability[],
  ): boolean {
    const key = grantKey(caller, sessionId);
    const list = this.grants.get(key);
    if (!list) return false;
    const index = list.findIndex(
      (grant) =>
        grant.caller === caller &&
        (!grant.toolName || grant.toolName === toolName) &&
        capabilities.every((cap) => grant.capabilities.includes(cap)),
    );
    if (index < 0) return false;
    const grant = list[index];
    if (grant.remainingUses !== undefined) {
      grant.remainingUses -= 1;
      if (grant.remainingUses <= 0) list.splice(index, 1);
    }
    if (list.length === 0) this.grants.delete(key);
    return true;
  }
}

function grantKey(caller: ToolContext["caller"], sessionId: string): string {
  return `${caller}:${sessionId}`;
}

function pluginIdFromSession(sessionId: string | undefined): string | null {
  if (!sessionId?.startsWith("plugin:")) return null;
  const pluginId = sessionId.slice("plugin:".length).trim();
  return pluginId || null;
}

function summarizePayload(value: unknown): string {
  const redacted = redact(value);
  const json = safeJson(redacted);
  return json.length > MAX_SUMMARY_CHARS
    ? `${json.slice(0, MAX_SUMMARY_CHARS)}...[truncated]`
    : json;
}

function redact(value: unknown, key = "", depth = 0): unknown {
  if (SECRET_KEY_RE.test(key)) return "[REDACTED]";
  if (typeof value === "string") {
    if (LARGE_TEXT_KEY_RE.test(key)) return `[REDACTED_TEXT ${value.length} chars]`;
    if (looksSensitiveString(value)) return "[REDACTED]";
    return value.length > MAX_STRING_CHARS
      ? `${value.slice(0, MAX_STRING_CHARS)}...[truncated ${value.length} chars]`
      : value;
  }
  if (value === null || typeof value !== "object") return value;
  if (depth > 6) return "[REDACTED_DEEP_OBJECT]";
  if (Array.isArray(value))
    return value.slice(0, 50).map((v) => redact(v, key, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    out[childKey] = redact(childValue, childKey, depth + 1);
  }
  return out;
}

function looksSensitiveString(value: string): boolean {
  if (/bearer\s+[a-z0-9._~+/=-]{12,}/i.test(value)) return true;
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value)) return true;
  if (value.length < 32) return false;
  if (!/^[A-Za-z0-9+/=_.,:-]+$/.test(value)) return false;
  return new Set(value).size >= 12;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '"[UNSERIALIZABLE]"';
  }
}

function isAuditEntry(raw: unknown): raw is AuditEntry {
  if (!raw || typeof raw !== "object") return false;
  const rec = raw as Partial<AuditEntry>;
  return (
    typeof rec.id === "string" &&
    typeof rec.ts === "number" &&
    typeof rec.caller === "string" &&
    typeof rec.toolName === "string" &&
    Array.isArray(rec.capabilities) &&
    (rec.decision === "allow" || rec.decision === "deny") &&
    typeof rec.cwd === "string" &&
    typeof rec.argsSummary === "string" &&
    typeof rec.resultSummary === "string" &&
    typeof rec.durationMs === "number"
  );
}
