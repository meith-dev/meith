import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  type AgentMessage,
  AgentMessageSchema,
  type AgentSessionMeta,
  AgentSessionMetaSchema,
  type AgentTextSegment,
  type AgentToolCall,
  type AgentUsage,
} from "@meith/shared";
import { JsonStore } from "../storage/JsonStore.js";
import { JsonlStore } from "../storage/JsonlStore.js";

const TRANSCRIPT_COMPACT_BYTES = 25 * 1024 * 1024;
const DISPLAY_TRANSCRIPT_BYTES = 5 * 1024 * 1024;
const DISPLAY_TRANSCRIPT_RECORDS = 500;
const DISPLAY_MAX_MESSAGES = 20;
const DISPLAY_MAX_MESSAGE_CHARS = 20_000;
const DISPLAY_MAX_TOTAL_CHARS = 50_000;
const DISPLAY_MAX_TOOL_CALLS = 30;
const DISPLAY_MAX_TOOL_ARG_CHARS = 2_000;
const DISPLAY_MAX_TOOL_RESULT_CHARS = 4_000;
const DISPLAY_MAX_VALUE_STRING_CHARS = 1_000;
const DISPLAY_MAX_VALUE_DEPTH = 4;
const DISPLAY_MAX_ARRAY_ITEMS = 20;
const DISPLAY_MAX_OBJECT_KEYS = 30;
const OMITTED_PREFIX = "[Earlier content omitted]\n\n";

type AgentTranscriptRecord = AgentMessage | AgentMessagePatch;

export interface AgentMessagePatch {
  type: "message_patch";
  messageId: string;
  role?: AgentMessage["role"];
  createdAt?: number;
  contentDelta?: string;
  textSegments?: AgentTextSegment[];
  toolCalls?: AgentToolCall[];
  usage?: AgentUsage;
  error?: string;
}

/**
 * Durable persistence for agent sessions.
 *
 * - The session index (`agent/sessions.json`) holds small metadata records and
 *   is rewritten atomically (debounced) via `JsonStore`.
 * - Each session's transcript lives in an append-only JSONL file
 *   (`agent/sessions/<id>.jsonl`). Messages are appended on every mutation;
 *   since a message can change (tool-call status updates), reads dedupe by id and
 *   merge tool-call snapshots so status updates do not erase earlier names/args.
 */
export class AgentStore {
  private readonly index: JsonStore<AgentSessionMeta[]>;
  private readonly sessionsDir: string;
  private readonly transcripts = new Map<string, JsonlStore<AgentTranscriptRecord>>();

  constructor(dataDir: string) {
    const agentDir = join(dataDir, "agent");
    this.sessionsDir = join(agentDir, "sessions");
    mkdirSync(this.sessionsDir, { recursive: true });
    this.index = new JsonStore<AgentSessionMeta[]>({
      path: join(agentDir, "sessions.json"),
      parse: (raw) =>
        Array.isArray(raw)
          ? raw
              .map((r) => AgentSessionMetaSchema.safeParse(r))
              .filter((r) => r.success)
              .map((r) => (r as { data: AgentSessionMeta }).data)
          : [],
      defaults: () => [],
    });
  }

  private transcript(sessionId: string): JsonlStore<AgentTranscriptRecord> {
    let store = this.transcripts.get(sessionId);
    if (!store) {
      store = new JsonlStore<AgentTranscriptRecord>({
        path: join(this.sessionsDir, `${sessionId}.jsonl`),
        parse: (raw) => {
          const parsed = AgentMessageSchema.safeParse(raw);
          if (parsed.success) return parsed.data;
          return parseMessagePatch(raw);
        },
        // Generous cap; transcripts are bounded by conversation length.
        maxRecords: 10_000,
      });
      this.transcripts.set(sessionId, store);
    }
    return store;
  }

  /** All session metadata, newest first. */
  listMeta(): AgentSessionMeta[] {
    return [...this.index.get()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getMeta(sessionId: string): AgentSessionMeta | undefined {
    return this.index.get().find((s) => s.id === sessionId);
  }

  /** Insert or replace a session's metadata record and persist the index. */
  upsertMeta(meta: AgentSessionMeta): void {
    const next = this.index.get().filter((s) => s.id !== meta.id);
    next.push(meta);
    this.index.set(next);
  }

  /** The transcript for a session, deduped by message id with merged tool calls. */
  readMessages(sessionId: string): AgentMessage[] {
    const transcript = this.transcript(sessionId);
    const sizeBefore = transcript.sizeBytes();
    const records = transcript.readAll();
    const messages = recordsToMessages(records);
    if (shouldCompactTranscript(sizeBefore, records.length, messages.length)) {
      transcript.replaceAll(messages);
    }
    return messages;
  }

  /** Read enough recent transcript data for interactive UI display. */
  readDisplayMessages(sessionId: string): AgentMessage[] {
    const transcript = this.transcript(sessionId);
    const size = transcript.sizeBytes();
    const messages =
      size <= DISPLAY_TRANSCRIPT_BYTES
        ? this.readMessages(sessionId)
        : recordsToMessages(
            transcript.readRecent(DISPLAY_TRANSCRIPT_BYTES, DISPLAY_TRANSCRIPT_RECORDS),
          );
    return limitDisplayMessages(messages);
  }

  /** Same as `readDisplayMessages`, but avoids full compaction reads entirely. */
  readDisplayMessagesFast(sessionId: string): AgentMessage[] {
    const transcript = this.transcript(sessionId);
    return limitDisplayMessages(
      recordsToMessages(
        transcript.readRecent(DISPLAY_TRANSCRIPT_BYTES, DISPLAY_TRANSCRIPT_RECORDS),
      ),
    );
  }

  /** Append (or update) a single message record. */
  appendMessage(sessionId: string, message: AgentMessage): void {
    this.transcript(sessionId).append(message);
  }

  /** Append a compact mutation for one message record. */
  appendMessagePatch(sessionId: string, patch: AgentMessagePatch): void {
    this.transcript(sessionId).append(patch);
  }

  /** Remove a session's metadata and its transcript file. */
  deleteSession(sessionId: string): void {
    this.index.set(this.index.get().filter((s) => s.id !== sessionId));
    this.transcripts.delete(sessionId);
    const file = join(this.sessionsDir, `${sessionId}.jsonl`);
    if (existsSync(file)) {
      try {
        rmSync(file);
      } catch {
        // Best-effort: index removal already hides the session.
      }
    }
  }

  /** Flush any pending index write to disk (call on shutdown). */
  flush(): void {
    this.index.flush();
  }
}

function limitDisplayMessages(messages: AgentMessage[]): AgentMessage[] {
  let remainingTotal = DISPLAY_MAX_TOTAL_CHARS;
  const recent = messages.slice(-DISPLAY_MAX_MESSAGES);
  const out: AgentMessage[] = [];
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const message = recent[i];
    const maxChars = Math.max(0, Math.min(DISPLAY_MAX_MESSAGE_CHARS, remainingTotal));
    const limited = limitMessageContent(message, maxChars);
    remainingTotal = Math.max(0, remainingTotal - limited.content.length);
    out.push(limited);
    if (remainingTotal === 0) break;
  }
  return out.reverse();
}

function limitMessageContent(message: AgentMessage, maxChars: number): AgentMessage {
  const base =
    message.content.length <= maxChars ? message : limitContentOnly(message, maxChars);
  return limitMessageToolCalls(base);
}

function limitContentOnly(message: AgentMessage, maxChars: number): AgentMessage {
  const tailChars = maxChars - OMITTED_PREFIX.length;
  const content =
    tailChars <= 0
      ? OMITTED_PREFIX.slice(0, Math.max(0, maxChars))
      : `${OMITTED_PREFIX}${message.content.slice(-tailChars)}`;
  return {
    ...message,
    content,
    textSegments: undefined,
    toolCalls: message.toolCalls?.map((call) => ({
      ...call,
      contentOffset: undefined,
    })),
  };
}

function limitMessageToolCalls(message: AgentMessage): AgentMessage {
  if (!message.toolCalls?.length) return message;
  const calls = message.toolCalls.slice(-DISPLAY_MAX_TOOL_CALLS).map((call) => ({
    ...call,
    args: limitUnknownForDisplay(call.args ?? {}, DISPLAY_MAX_TOOL_ARG_CHARS) as Record<
      string,
      unknown
    >,
    result: call.result
      ? {
          ...call.result,
          content: limitUnknownForDisplay(
            call.result.content,
            DISPLAY_MAX_TOOL_RESULT_CHARS,
          ),
          meta: limitUnknownForDisplay(call.result.meta, DISPLAY_MAX_TOOL_ARG_CHARS) as
            | Record<string, unknown>
            | undefined,
          diagnostics: limitUnknownForDisplay(
            call.result.diagnostics,
            DISPLAY_MAX_TOOL_ARG_CHARS,
          ) as typeof call.result.diagnostics,
          error: call.result.error
            ? {
                ...call.result.error,
                message: limitString(
                  call.result.error.message,
                  DISPLAY_MAX_VALUE_STRING_CHARS,
                ),
              }
            : undefined,
        }
      : undefined,
    error: call.error
      ? limitString(call.error, DISPLAY_MAX_VALUE_STRING_CHARS)
      : undefined,
  }));
  return {
    ...message,
    toolCalls: calls,
  };
}

function limitUnknownForDisplay(value: unknown, maxChars: number): unknown {
  const budget = { remaining: maxChars };
  return limitValue(value, budget, 0);
}

function limitValue(
  value: unknown,
  budget: { remaining: number },
  depth: number,
): unknown {
  if (budget.remaining <= 0) return "[Omitted from session preview]";
  if (value == null || typeof value === "number" || typeof value === "boolean") {
    budget.remaining -= String(value).length;
    return value;
  }
  if (typeof value === "string") {
    return limitBudgetedString(value, budget);
  }
  if (depth >= DISPLAY_MAX_VALUE_DEPTH) {
    return "[Nested value omitted from session preview]";
  }
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    const items = value.slice(0, DISPLAY_MAX_ARRAY_ITEMS);
    for (const item of items) {
      out.push(limitValue(item, budget, depth + 1));
      if (budget.remaining <= 0) break;
    }
    if (value.length > items.length) {
      out.push(`[${value.length - items.length} more item(s) omitted]`);
    }
    return out;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [key, item] of entries.slice(0, DISPLAY_MAX_OBJECT_KEYS)) {
      budget.remaining -= key.length;
      out[key] = limitValue(item, budget, depth + 1);
      if (budget.remaining <= 0) break;
    }
    if (entries.length > DISPLAY_MAX_OBJECT_KEYS) {
      out.__omittedKeys = entries.length - DISPLAY_MAX_OBJECT_KEYS;
    }
    return out;
  }
  return String(value);
}

function limitBudgetedString(value: string, budget: { remaining: number }): string {
  const max = Math.min(DISPLAY_MAX_VALUE_STRING_CHARS, Math.max(0, budget.remaining));
  budget.remaining -= Math.min(value.length, max);
  return limitString(value, max);
}

function limitString(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  if (maxChars <= OMITTED_PREFIX.length) return "[Omitted]";
  const tailChars = Math.max(0, maxChars - OMITTED_PREFIX.length);
  return `${OMITTED_PREFIX}${value.slice(-tailChars)}`;
}

function recordsToMessages(records: AgentTranscriptRecord[]): AgentMessage[] {
  const byId = new Map<string, AgentMessage>();
  const contentPartsById = new Map<string, string[]>();
  const order: string[] = [];
  const appendContentDelta = (
    messageId: string,
    message: AgentMessage,
    delta: string,
  ) => {
    let parts = contentPartsById.get(messageId);
    if (!parts) {
      parts = [message.content];
      contentPartsById.set(messageId, parts);
    }
    parts.push(delta);
  };
  const flushContent = (messageId: string, message: AgentMessage): AgentMessage => {
    const parts = contentPartsById.get(messageId);
    if (!parts) return message;
    contentPartsById.delete(messageId);
    return { ...message, content: parts.join("") };
  };

  for (const record of records) {
    if (isMessagePatch(record)) {
      if (!byId.has(record.messageId)) order.push(record.messageId);
      const existing = byId.get(record.messageId);
      const next = existing
        ? applyMessagePatch(existing, record, { deferContentDelta: true })
        : messageFromPatch(record, { deferContentDelta: true });
      if (record.contentDelta) {
        appendContentDelta(record.messageId, next, record.contentDelta);
      }
      byId.set(record.messageId, next);
      continue;
    }

    if (!byId.has(record.id)) order.push(record.id);
    const existing = byId.get(record.id);
    byId.set(
      record.id,
      existing
        ? mergeMessageSnapshots(flushContent(record.id, existing), record)
        : record,
    );
  }
  return order.map((id) => flushContent(id, byId.get(id) as AgentMessage));
}

function shouldCompactTranscript(
  sizeBytes: number,
  recordCount: number,
  messageCount: number,
): boolean {
  if (recordCount === 0) return false;
  if (sizeBytes > TRANSCRIPT_COMPACT_BYTES) return true;
  return recordCount > Math.max(100, messageCount * 3);
}

function parseMessagePatch(raw: unknown): AgentMessagePatch | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (record.type !== "message_patch" || typeof record.messageId !== "string") {
    return null;
  }
  const patch: AgentMessagePatch = {
    type: "message_patch",
    messageId: record.messageId,
  };
  if (
    record.role === "system" ||
    record.role === "user" ||
    record.role === "assistant" ||
    record.role === "tool"
  ) {
    patch.role = record.role;
  }
  if (typeof record.createdAt === "number") patch.createdAt = record.createdAt;
  if (typeof record.contentDelta === "string") {
    patch.contentDelta = record.contentDelta;
  }
  if (Array.isArray(record.textSegments)) {
    patch.textSegments = record.textSegments.filter(isTextSegment);
  }
  if (Array.isArray(record.toolCalls)) {
    patch.toolCalls = record.toolCalls.filter(isToolCall);
  }
  if (record.usage && typeof record.usage === "object") {
    patch.usage = record.usage as AgentUsage;
  }
  if (typeof record.error === "string") patch.error = record.error;
  return patch;
}

function isMessagePatch(record: AgentTranscriptRecord): record is AgentMessagePatch {
  return "type" in record && record.type === "message_patch";
}

interface ApplyMessagePatchOptions {
  deferContentDelta?: boolean;
}

function messageFromPatch(
  patch: AgentMessagePatch,
  options?: ApplyMessagePatchOptions,
): AgentMessage {
  return applyMessagePatch(
    {
      id: patch.messageId,
      role: patch.role ?? "assistant",
      content: "",
      createdAt: patch.createdAt ?? Date.now(),
    },
    patch,
    options,
  );
}

function applyMessagePatch(
  previous: AgentMessage,
  patch: AgentMessagePatch,
  options?: ApplyMessagePatchOptions,
): AgentMessage {
  const next: AgentMessage = {
    ...previous,
    role: patch.role ?? previous.role,
    createdAt: patch.createdAt ?? previous.createdAt,
  };
  if (patch.contentDelta && !options?.deferContentDelta) {
    next.content += patch.contentDelta;
  }
  next.textSegments = mergeTextSegments(next.textSegments, patch.textSegments);

  if (patch.toolCalls?.length) {
    const incoming: AgentMessage = {
      id: next.id,
      role: next.role,
      content: next.content,
      createdAt: next.createdAt,
      toolCalls: patch.toolCalls,
    };
    next.toolCalls = mergeMessageSnapshots(next, incoming).toolCalls;
  }
  if (patch.usage) next.usage = patch.usage;
  if (patch.error !== undefined) next.error = patch.error;
  return next;
}

function isTextSegment(value: unknown): value is AgentTextSegment {
  if (!value || typeof value !== "object") return false;
  const segment = value as Record<string, unknown>;
  return (
    typeof segment.start === "number" &&
    typeof segment.end === "number" &&
    typeof segment.text === "string" &&
    (segment.kind === undefined ||
      segment.kind === "thought" ||
      segment.kind === "message")
  );
}

function isToolCall(value: unknown): value is AgentToolCall {
  if (!value || typeof value !== "object") return false;
  const call = value as Record<string, unknown>;
  return (
    typeof call.id === "string" &&
    typeof call.name === "string" &&
    typeof call.startedAt === "number"
  );
}

function mergeMessageSnapshots(
  previous: AgentMessage,
  incoming: AgentMessage,
): AgentMessage {
  const merged: AgentMessage = { ...previous, ...incoming };
  merged.textSegments = mergeTextSegments(previous.textSegments, incoming.textSegments);
  if (!previous.toolCalls?.length || !incoming.toolCalls?.length) return merged;

  const calls = new Map(previous.toolCalls.map((call) => [call.id, call]));
  const order = previous.toolCalls.map((call) => call.id);
  for (const call of incoming.toolCalls) {
    if (!calls.has(call.id)) order.push(call.id);
    const existing = calls.get(call.id);
    calls.set(call.id, existing ? mergeToolCallSnapshots(existing, call) : call);
  }
  merged.toolCalls = order
    .map((id) => calls.get(id))
    .filter((call) => call !== undefined);
  return merged;
}

function mergeTextSegments(
  previous: AgentMessage["textSegments"],
  incoming: AgentMessage["textSegments"],
): AgentMessage["textSegments"] {
  if (!previous?.length) return incoming;
  if (!incoming?.length) return previous;

  const byStart = new Map(previous.map((segment) => [segment.start, segment]));
  for (const segment of incoming) {
    const existing = byStart.get(segment.start);
    if (!existing || segment.end >= existing.end) byStart.set(segment.start, segment);
  }
  return [...byStart.values()].sort((a, b) => a.start - b.start);
}

function mergeToolCallSnapshots(
  previous: NonNullable<AgentMessage["toolCalls"]>[number],
  incoming: NonNullable<AgentMessage["toolCalls"]>[number],
): NonNullable<AgentMessage["toolCalls"]>[number] {
  const previousName = previous.name;
  const previousArgs = previous.args;
  const previousContentOffset = previous.contentOffset;
  const incomingNameIsGeneric = incoming.name.trim().toLowerCase() === "tool";
  const incomingHasArgs = Object.keys(incoming.args ?? {}).length > 0;

  return {
    ...previous,
    ...incoming,
    name:
      incomingNameIsGeneric && previousName.trim().toLowerCase() !== "tool"
        ? previousName
        : incoming.name,
    args:
      !incomingHasArgs && Object.keys(previousArgs ?? {}).length > 0
        ? previousArgs
        : incoming.args,
    startedAt: Math.min(previous.startedAt, incoming.startedAt),
    result: incoming.result ?? previous.result,
    error: incoming.error ?? previous.error,
    contentOffset: incoming.contentOffset ?? previousContentOffset,
  };
}
