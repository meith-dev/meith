import type {
  AgentConfig,
  AgentConfigOption,
  AgentMessage,
  AgentPermissionRequest,
  AgentSession,
  AgentSessionMeta,
  AgentToolCall,
  ToolResult,
} from "@meith/shared";
import {
  isDefaultAgentSessionTitle,
  newMessageId,
  summarizeAgentSessionTitle,
} from "@meith/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MeithBridge } from "../../../bridge.js";

/** Upsert session metadata into a list, keeping it sorted by recency. */
function upsertMeta(
  list: AgentSessionMeta[],
  meta: AgentSessionMeta,
): AgentSessionMeta[] {
  const next = list.filter((s) => s.id !== meta.id);
  next.push(meta);
  next.sort((a, b) => b.updatedAt - a.updatedAt);
  return next;
}

function stripMessages(session: AgentSession): AgentSessionMeta {
  const { messages: _messages, ...meta } = session;
  return meta;
}

function sessionFromMeta(meta: AgentSessionMeta): AgentSession {
  return { ...meta, messages: [] };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Timed out")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Module-level cache of probed model/reasoning options, keyed by the agent
 * target. Survives the hook being unmounted/remounted (e.g. switching tabs or
 * spaces), so reopening the agent panel shows the cached models immediately
 * instead of flashing a loading state while it re-probes. The main process also
 * caches the underlying probe, so this is purely to avoid the UI flicker.
 */
const probeOptionsCache = new Map<string, AgentConfigOption[]>();

function agentTargetKey(config: AgentConfig): string {
  return `${config.adapter}|${config.acpPreset}|${config.command}|${config.args.join(" ")}`;
}

export interface UseAgent {
  sessions: AgentSessionMeta[];
  activeId: string | null;
  session: AgentSession | null;
  sessionLoading: boolean;
  /** Text accumulated for the in-flight assistant turn (cleared on done). */
  streaming: string;
  permissions: AgentPermissionRequest[];
  config: AgentConfig | null;
  busy: boolean;
  /** Config options (models, reasoning) advertised by the active ACP agent. */
  modelOptions: AgentConfigOption[];
  /** True while the agent is being probed for its advertised options. */
  modelOptionsLoading: boolean;
  selectSession: (id: string) => Promise<void>;
  createSession: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  cancel: () => Promise<void>;
  decide: (
    req: AgentPermissionRequest,
    decision: "allow" | "deny",
    remember: boolean,
  ) => Promise<void>;
  saveConfig: (patch: Partial<AgentConfig>) => Promise<void>;
  /**
   * Switch the active session's model/reasoning level and persist it as the new
   * default. Optimistically updates local state for instant feedback.
   */
  setSessionModel: (patch: { model?: string; reasoning?: string }) => Promise<void>;
}

/**
 * Owns all agent runtime state for the chat UI. Streamed run output, session
 * metadata changes, and permission prompts arrive over push channels; we
 * subscribe EXACTLY ONCE (stable `bridge`) and route by the live active session
 * via a ref, so React StrictMode's mount/cleanup/mount cycle never leaves more
 * than one live subscriber (the cause of duplicated streamed text).
 */
export function useAgent(
  bridge: MeithBridge,
  defaults: { cwd: string; spaceId: string | null },
): UseAgent {
  const [sessions, setSessions] = useState<AgentSessionMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [session, setSession] = useState<AgentSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [permissions, setPermissions] = useState<AgentPermissionRequest[]>([]);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [modelOptions, setModelOptions] = useState<AgentConfigOption[]>([]);
  const [modelOptionsLoading, setModelOptionsLoading] = useState(false);
  const streamingBySessionRef = useRef(new Map<string, string>());
  const sessionRef = useRef<AgentSession | null>(null);
  sessionRef.current = session;
  const sessionsRef = useRef<AgentSessionMeta[]>([]);
  sessionsRef.current = sessions;

  // Mirror mutable values the (stable) subscription handlers need to read.
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  const setActiveStreaming = useCallback(() => {
    const id = activeIdRef.current;
    setStreaming(id ? (streamingBySessionRef.current.get(id) ?? "") : "");
  }, []);

  const seedStreamingFromSession = useCallback((full: AgentSession | null) => {
    if (!full || full.status !== "running") return;
    const content = currentTurnAssistantContent(full);
    if (content && !streamingBySessionRef.current.has(full.id)) {
      streamingBySessionRef.current.set(full.id, content);
    }
  }, []);

  const markSessionViewed = useCallback(
    async (id: string) => {
      const meta = await bridge.agent.markSessionViewed(id);
      if (!meta || meta.spaceId !== defaultsRef.current.spaceId) return;
      setSessions((prev) => upsertMeta(prev, meta));
      if (meta.id === activeIdRef.current) {
        setSession((prev) => (prev ? { ...prev, ...meta } : prev));
      }
    },
    [bridge],
  );

  // Workspace load: sessions + config, then select the most recent (or create).
  useEffect(() => {
    let cancelled = false;
    setSessions([]);
    setActiveId(null);
    setSession(null);
    setSessionLoading(false);
    setStreaming("");
    setPermissions([]);
    void (async () => {
      const [metas, cfg] = await Promise.all([
        bridge.agent.listSessions(),
        bridge.agent.getConfig(),
      ]);
      if (cancelled) return;
      // Filter sessions to only show those belonging to the current workspace
      const { spaceId } = defaultsRef.current;
      const filteredMetas = metas.filter((meta) => meta.spaceId === spaceId);
      setSessions(filteredMetas);
      setConfig(cfg);
      if (filteredMetas.length > 0) {
        const selectedMeta = filteredMetas[0];
        const selectedId = selectedMeta.id;
        activeIdRef.current = selectedId;
        setActiveId(selectedId);
        setSession(null);
        setSessionLoading(true);
        setStreaming(streamingBySessionRef.current.get(selectedId) ?? "");
        if (cancelled || activeIdRef.current !== selectedId) return;
        try {
          const full = await withTimeout(bridge.agent.getSession(selectedId), 3000);
          if (cancelled) return;
          const displaySession = full ?? sessionFromMeta(selectedMeta);
          seedStreamingFromSession(displaySession);
          if (activeIdRef.current !== selectedId) return;
          setSession(displaySession);
          setSessionLoading(false);
          setStreaming(streamingBySessionRef.current.get(selectedId) ?? "");
          void markSessionViewed(selectedId);
        } catch {
          if (!cancelled && activeIdRef.current === selectedId) {
            setSession(sessionFromMeta(selectedMeta));
            setSessionLoading(false);
          }
        }
      } else {
        const { cwd, spaceId } = defaultsRef.current;
        const created = await bridge.agent.createSession({ cwd, spaceId });
        if (cancelled) return;
        setSessions((prev) => upsertMeta(prev, stripMessages(created)));
        activeIdRef.current = created.id;
        setActiveId(created.id);
        setSession(created);
        setSessionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    bridge,
    defaults.cwd,
    defaults.spaceId,
    markSessionViewed,
    seedStreamingFromSession,
  ]);

  // Refetch the agent config when it's changed elsewhere (e.g. the global
  // Settings dialog) so the header badge stays in sync.
  useEffect(() => {
    const onChanged = () => {
      // The agent target may have changed (or the CLI was just installed), so
      // drop cached options to force a fresh probe in sync with the main process.
      probeOptionsCache.clear();
      void bridge.agent.getConfig().then(setConfig);
    };
    window.addEventListener("meith:agent-config-changed", onChanged);
    return () => window.removeEventListener("meith:agent-config-changed", onChanged);
  }, [bridge]);

  // Probe the configured agent for the model/reasoning options it advertises so
  // the composer switcher can offer them. Only meaningful for ACP agents; the
  // mock adapter returns synthetic options. Re-runs when the agent target
  // changes (adapter/preset/command/args).
  const probeKey = config ? agentTargetKey(config) : null;
  useEffect(() => {
    if (!config || config.adapter !== "acp") {
      setModelOptions([]);
      setModelOptionsLoading(false);
      return;
    }
    if (sessionLoading || !activeId) {
      setModelOptionsLoading(false);
      return;
    }
    let cancelled = false;
    // Seed from cache for instant display; only show the loading state on a
    // genuine first probe for this target.
    const cached = probeKey ? probeOptionsCache.get(probeKey) : undefined;
    if (cached) {
      setModelOptions(cached);
      setModelOptionsLoading(false);
    } else {
      setModelOptions([]);
      setModelOptionsLoading(true);
    }
    const handle = window.setTimeout(() => {
      void bridge.agent
        .probe({
          acpPreset: config.acpPreset,
          command: config.command,
          args: config.args,
        })
        .then((result) => {
          const options = result.installed ? result.options : [];
          if (probeKey) probeOptionsCache.set(probeKey, options);
          if (!cancelled) setModelOptions(options);
        })
        .catch(() => {
          if (!cancelled && !cached) setModelOptions([]);
        })
        .finally(() => {
          if (!cancelled) setModelOptionsLoading(false);
        });
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, probeKey, sessionLoading, activeId]);

  // Single, stable subscription set for the lifetime of the hook.
  useEffect(() => {
    const offChunk = bridge.agent.onChunk(({ sessionId, chunk }) => {
      const isActive = sessionId === activeIdRef.current;
      switch (chunk.type) {
        case "text":
          streamingBySessionRef.current.set(
            sessionId,
            (streamingBySessionRef.current.get(sessionId) ??
              (isActive ? currentTurnAssistantContent(sessionRef.current) : "")) +
              chunk.text,
          );
          if (isActive) {
            setActiveStreaming();
            setSession((prev) => appendLiveAssistantText(prev, chunk.text, chunk.kind));
          }
          break;
        case "tool_call":
          if (isActive) {
            setSession((prev) => upsertLiveToolCall(prev, chunk.toolCall));
          }
          break;
        case "tool_result":
          if (isActive) {
            setSession((prev) =>
              applyLiveToolResult(prev, chunk.toolCallId, chunk.result),
            );
          }
          break;
        case "done":
        case "error":
          streamingBySessionRef.current.delete(sessionId);
          if (isActive) setStreaming("");
          break;
        default:
          break;
      }
    });
    const offSession = bridge.agent.onSession((meta) => {
      // Only update sessions that belong to the current workspace
      if (meta.spaceId === defaultsRef.current.spaceId) {
        setSessions((prev) => upsertMeta(prev, meta));
        if (meta.id === activeIdRef.current) {
          setSession((prev) => (prev ? { ...prev, ...meta } : prev));
          if (hasUnseenFinishedSession(meta)) void markSessionViewed(meta.id);
        }
      }
    });
    const offPermission = bridge.agent.onPermission((req) => {
      if (req.sessionId !== activeIdRef.current) return;
      setPermissions((prev) =>
        prev.some((p) => p.toolCallId === req.toolCallId) ? prev : [...prev, req],
      );
    });
    return () => {
      offChunk();
      offSession();
      offPermission();
    };
  }, [bridge, markSessionViewed, setActiveStreaming]);

  const selectSession = useCallback(
    async (id: string) => {
      setStreaming(streamingBySessionRef.current.get(id) ?? "");
      setPermissions([]);
      activeIdRef.current = id;
      setActiveId(id);
      setSession(null);
      setSessionLoading(true);
      if (activeIdRef.current !== id) return;
      try {
        const full = await withTimeout(bridge.agent.getSession(id), 3000);
        const fallback = sessionsRef.current.find((meta) => meta.id === id);
        const displaySession = full ?? (fallback ? sessionFromMeta(fallback) : null);
        seedStreamingFromSession(displaySession);
        if (activeIdRef.current !== id) return;
        setSession(displaySession);
        setSessionLoading(false);
        setStreaming(streamingBySessionRef.current.get(id) ?? "");
        void markSessionViewed(id);
      } catch {
        if (activeIdRef.current === id) {
          const fallback = sessionsRef.current.find((meta) => meta.id === id);
          setSession(fallback ? sessionFromMeta(fallback) : null);
          setSessionLoading(false);
        }
      }
    },
    [bridge, markSessionViewed, seedStreamingFromSession],
  );

  const createSession = useCallback(async () => {
    const { cwd, spaceId } = defaultsRef.current;
    const created = await bridge.agent.createSession({ cwd, spaceId });
    setSessions((prev) => upsertMeta(prev, stripMessages(created)));
    setStreaming("");
    streamingBySessionRef.current.delete(created.id);
    setPermissions([]);
    setActiveId(created.id);
    setSession(created);
    setSessionLoading(false);
  }, [bridge]);

  const deleteSession = useCallback(
    async (id: string) => {
      await bridge.agent.deleteSession(id);
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);
      if (id === activeIdRef.current) {
        if (remaining.length > 0) {
          await selectSession(remaining[0].id);
        } else {
          setActiveId(null);
          setSession(null);
          setSessionLoading(false);
          setStreaming("");
        }
      }
    },
    [bridge, sessions, selectSession],
  );

  const send = useCallback(
    async (text: string) => {
      const id = activeIdRef.current;
      if (!id || !text.trim()) return;
      setBusy(true);
      setStreaming("");
      streamingBySessionRef.current.delete(id);
      const createdAt = Date.now();
      // Optimistic user bubble; replaced by the authoritative final session.
      setSession((prev) =>
        prev ? optimisticSessionForPrompt(prev, text, createdAt) : prev,
      );
      setSessions((prev) => {
        const current = prev.find((meta) => meta.id === id);
        if (!current) return prev;
        const title =
          isDefaultAgentSessionTitle(current.title) && summarizeAgentSessionTitle(text);
        return upsertMeta(prev, {
          ...current,
          title: title || current.title,
          status: "running",
          updatedAt: createdAt,
        });
      });
      try {
        const final = await bridge.agent.sendMessage(id, text);
        if (final && final.id === activeIdRef.current) {
          setSession(final);
          setSessions((prev) => upsertMeta(prev, stripMessages(final)));
          void markSessionViewed(final.id);
        }
      } finally {
        streamingBySessionRef.current.delete(id);
        if (id === activeIdRef.current) setStreaming("");
        setBusy(false);
      }
    },
    [bridge, markSessionViewed],
  );

  const cancel = useCallback(async () => {
    const id = activeIdRef.current;
    if (!id) return;
    await bridge.agent.cancel(id);
    streamingBySessionRef.current.delete(id);
    setStreaming("");
  }, [bridge]);

  const decide = useCallback(
    async (
      req: AgentPermissionRequest,
      decision: "allow" | "deny",
      remember: boolean,
    ) => {
      setPermissions((prev) => prev.filter((p) => p.toolCallId !== req.toolCallId));
      await bridge.agent.decide({
        sessionId: req.sessionId,
        toolCallId: req.toolCallId,
        decision,
        remember,
      });
    },
    [bridge],
  );

  const saveConfig = useCallback(
    async (patch: Partial<AgentConfig>) => {
      const next = await bridge.agent.setConfig(patch);
      setConfig(next);
    },
    [bridge],
  );

  const setSessionModel = useCallback(
    async (patch: { model?: string; reasoning?: string }) => {
      const id = activeIdRef.current;
      if (!id) return;
      // Optimistic local update so the switcher label changes immediately.
      setSession((prev) => (prev ? { ...prev, ...patch } : prev));
      setConfig((prev) => (prev ? { ...prev, ...patch } : prev));
      const meta = await bridge.agent.setSessionModel(id, patch);
      if (meta.id === activeIdRef.current) {
        setSession((prev) => (prev ? { ...prev, ...meta } : prev));
        setSessions((prev) => upsertMeta(prev, meta));
      }
    },
    [bridge],
  );

  return {
    sessions,
    activeId,
    session,
    sessionLoading,
    streaming,
    permissions,
    config,
    busy,
    modelOptions,
    modelOptionsLoading,
    selectSession,
    createSession,
    deleteSession,
    send,
    cancel,
    decide,
    saveConfig,
    setSessionModel,
  };
}

function optimisticSessionForPrompt(
  session: AgentSession,
  text: string,
  createdAt: number,
): AgentSession {
  const title =
    isDefaultAgentSessionTitle(session.title) && summarizeAgentSessionTitle(text);
  return {
    ...session,
    title: title || session.title,
    status: "running",
    updatedAt: createdAt,
    messages: [
      ...session.messages,
      {
        id: `optimistic-${createdAt}`,
        role: "user" as const,
        content: text,
        createdAt,
      },
    ],
  };
}

function appendLiveAssistantText(
  session: AgentSession | null,
  text: string,
  kind: "thought" | "message" = "message",
): AgentSession | null {
  if (!session || !text) return session;
  return updateLiveAssistant(session, (assistant) => {
    const start = assistant.content.length;
    const end = start + text.length;
    const toolStartsHere = assistant.toolCalls?.some(
      (call) => call.contentOffset === start,
    );
    const textSegments = assistant.textSegments ? [...assistant.textSegments] : [];
    const previous = textSegments.at(-1);

    assistant.content += text;
    if (
      previous &&
      previous.end === start &&
      !toolStartsHere &&
      textSegmentKind(previous) === kind
    ) {
      textSegments[textSegments.length - 1] = {
        ...previous,
        end,
        text: `${previous.text}${text}`,
      };
    } else {
      textSegments.push(agentTextSegment(start, end, text, kind));
    }
    assistant.textSegments = textSegments;
  });
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

function upsertLiveToolCall(
  session: AgentSession | null,
  toolCall: AgentToolCall,
): AgentSession | null {
  if (!session) return session;
  return updateLiveAssistant(session, (assistant) => {
    const calls = assistant.toolCalls ? [...assistant.toolCalls] : [];
    const index = calls.findIndex((call) => call.id === toolCall.id);
    if (index === -1) {
      calls.push({
        ...toolCall,
        contentOffset: toolCall.contentOffset ?? assistant.content.length,
      });
    } else {
      calls[index] = mergeLiveToolCall(calls[index], toolCall);
    }
    assistant.toolCalls = calls;
  });
}

function applyLiveToolResult(
  session: AgentSession | null,
  toolCallId: string,
  result: ToolResult,
): AgentSession | null {
  if (!session) return session;
  return updateLiveAssistant(session, (assistant) => {
    const calls = assistant.toolCalls ? [...assistant.toolCalls] : [];
    const index = calls.findIndex((call) => call.id === toolCallId);
    if (index === -1) return;
    calls[index] = {
      ...calls[index],
      result,
      status: result.ok ? "ok" : "error",
      endedAt: Date.now(),
    };
    assistant.toolCalls = calls;
  });
}

function updateLiveAssistant(
  session: AgentSession,
  mutate: (assistant: AgentMessage) => void,
): AgentSession {
  const messages = [...session.messages];
  let index = latestCurrentTurnAssistantIndex(messages);
  if (index === -1) {
    index = messages.length;
    messages.push({
      id: newMessageId(),
      role: "assistant",
      content: "",
      toolCalls: [],
      createdAt: Date.now(),
    });
  }
  const current = messages[index] as AgentMessage;
  const assistant: AgentMessage = {
    ...current,
    textSegments: current.textSegments ? [...current.textSegments] : undefined,
    toolCalls: current.toolCalls ? [...current.toolCalls] : [],
  };
  mutate(assistant);
  messages[index] = assistant;
  return { ...session, messages, updatedAt: Date.now() };
}

function latestCurrentTurnAssistantIndex(messages: AgentMessage[]): number {
  let latestUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      latestUserIndex = i;
      break;
    }
  }
  for (let i = messages.length - 1; i > latestUserIndex; i -= 1) {
    if (messages[i].role === "assistant") return i;
  }
  return -1;
}

function hasUnseenFinishedSession(meta: AgentSessionMeta): boolean {
  return (
    meta.status !== "running" &&
    meta.lastViewedAt !== undefined &&
    meta.updatedAt > meta.lastViewedAt
  );
}

function currentTurnAssistantContent(session: AgentSession | null): string {
  if (!session) return "";
  const index = latestCurrentTurnAssistantIndex(session.messages);
  if (index === -1) return "";
  return session.messages[index].content ?? "";
}

function mergeLiveToolCall(
  previous: AgentToolCall,
  incoming: AgentToolCall,
): AgentToolCall {
  const incomingNameIsGeneric = incoming.name.trim().toLowerCase() === "tool";
  const previousNameIsSpecific = previous.name.trim().toLowerCase() !== "tool";
  const incomingHasArgs = Object.keys(incoming.args ?? {}).length > 0;
  const previousHasArgs = Object.keys(previous.args ?? {}).length > 0;
  return {
    ...previous,
    ...incoming,
    name: incomingNameIsGeneric && previousNameIsSpecific ? previous.name : incoming.name,
    args: !incomingHasArgs && previousHasArgs ? previous.args : incoming.args,
    result: incoming.result ?? previous.result,
    error: incoming.error ?? previous.error,
    contentOffset: incoming.contentOffset ?? previous.contentOffset,
    startedAt: Math.min(previous.startedAt, incoming.startedAt),
  };
}
