import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  type AgentMessage,
  AgentMessageSchema,
  type AgentSessionMeta,
  AgentSessionMetaSchema,
} from "@meith/shared";
import { JsonStore } from "../storage/JsonStore.js";
import { JsonlStore } from "../storage/JsonlStore.js";

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
  private readonly transcripts = new Map<string, JsonlStore<AgentMessage>>();

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

  private transcript(sessionId: string): JsonlStore<AgentMessage> {
    let store = this.transcripts.get(sessionId);
    if (!store) {
      store = new JsonlStore<AgentMessage>({
        path: join(this.sessionsDir, `${sessionId}.jsonl`),
        parse: (raw) => {
          const parsed = AgentMessageSchema.safeParse(raw);
          return parsed.success ? parsed.data : null;
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
    const records = this.transcript(sessionId).readAll();
    const byId = new Map<string, AgentMessage>();
    const order: string[] = [];
    for (const msg of records) {
      if (!byId.has(msg.id)) order.push(msg.id);
      const existing = byId.get(msg.id);
      byId.set(msg.id, existing ? mergeMessageSnapshots(existing, msg) : msg);
    }
    return order.map((id) => byId.get(id) as AgentMessage);
  }

  /** Append (or update) a single message record. */
  appendMessage(sessionId: string, message: AgentMessage): void {
    this.transcript(sessionId).append(message);
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
