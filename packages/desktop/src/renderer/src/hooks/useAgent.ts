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
import { newMessageId } from "@meith/shared";
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

export interface UseAgent {
  sessions: AgentSessionMeta[];
  activeId: string | null;
  session: AgentSession | null;
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
  const [streaming, setStreaming] = useState("");
  const [permissions, setPermissions] = useState<AgentPermissionRequest[]>([]);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [modelOptions, setModelOptions] = useState<AgentConfigOption[]>([]);
  const [modelOptionsLoading, setModelOptionsLoading] = useState(false);

  // Mirror mutable values the (stable) subscription handlers need to read.
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;

  // Initial load: sessions + config, then select the most recent (or create).
  useEffect(() => {
    let cancelled = false;
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
        const full = await bridge.agent.getSession(filteredMetas[0].id);
        if (cancelled) return;
        setActiveId(filteredMetas[0].id);
        setSession(full);
      } else {
        const { cwd, spaceId } = defaultsRef.current;
        const created = await bridge.agent.createSession({ cwd, spaceId });
        if (cancelled) return;
        setSessions((prev) => upsertMeta(prev, stripMessages(created)));
        setActiveId(created.id);
        setSession(created);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  // Refetch the agent config when it's changed elsewhere (e.g. the global
  // Settings dialog) so the header badge stays in sync.
  useEffect(() => {
    const onChanged = () => {
      void bridge.agent.getConfig().then(setConfig);
    };
    window.addEventListener("meith:agent-config-changed", onChanged);
    return () => window.removeEventListener("meith:agent-config-changed", onChanged);
  }, [bridge]);

  // Probe the configured agent for the model/reasoning options it advertises so
  // the composer switcher can offer them. Only meaningful for ACP agents; the
  // mock adapter returns synthetic options. Re-runs when the agent target
  // changes (adapter/preset/command/args).
  const probeKey = config
    ? `${config.adapter}|${config.acpPreset}|${config.command}|${config.args.join(" ")}`
    : null;
  useEffect(() => {
    if (!config || config.adapter !== "acp") {
      setModelOptions([]);
      setModelOptionsLoading(false);
      return;
    }
    let cancelled = false;
    setModelOptionsLoading(true);
    void bridge.agent
      .probe({ acpPreset: config.acpPreset, command: config.command, args: config.args })
      .then((result) => {
        if (!cancelled) setModelOptions(result.installed ? result.options : []);
      })
      .catch(() => {
        if (!cancelled) setModelOptions([]);
      })
      .finally(() => {
        if (!cancelled) setModelOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, probeKey]);

  // Single, stable subscription set for the lifetime of the hook.
  useEffect(() => {
    const offChunk = bridge.agent.onChunk(({ sessionId, chunk }) => {
      if (sessionId !== activeIdRef.current) return;
      switch (chunk.type) {
        case "text":
          setStreaming((s) => s + chunk.text);
          setSession((prev) => appendLiveAssistantText(prev, chunk.text));
          break;
        case "tool_call":
          setSession((prev) => upsertLiveToolCall(prev, chunk.toolCall));
          break;
        case "tool_result":
          setSession((prev) => applyLiveToolResult(prev, chunk.toolCallId, chunk.result));
          break;
        case "done":
        case "error":
          setStreaming("");
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
  }, [bridge]);

  const selectSession = useCallback(
    async (id: string) => {
      setStreaming("");
      setPermissions([]);
      setActiveId(id);
      const full = await bridge.agent.getSession(id);
      setSession(full);
    },
    [bridge],
  );

  const createSession = useCallback(async () => {
    const { cwd, spaceId } = defaultsRef.current;
    const created = await bridge.agent.createSession({ cwd, spaceId });
    setSessions((prev) => upsertMeta(prev, stripMessages(created)));
    setStreaming("");
    setPermissions([]);
    setActiveId(created.id);
    setSession(created);
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
      // Optimistic user bubble; replaced by the authoritative final session.
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: "running",
              messages: [
                ...prev.messages,
                {
                  id: `optimistic-${Date.now()}`,
                  role: "user" as const,
                  content: text,
                  createdAt: Date.now(),
                },
              ],
            }
          : prev,
      );
      try {
        const final = await bridge.agent.sendMessage(id, text);
        if (final && final.id === activeIdRef.current) {
          setSession(final);
          setSessions((prev) => upsertMeta(prev, stripMessages(final)));
        }
      } finally {
        setStreaming("");
        setBusy(false);
      }
    },
    [bridge],
  );

  const cancel = useCallback(async () => {
    const id = activeIdRef.current;
    if (!id) return;
    await bridge.agent.cancel(id);
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

function appendLiveAssistantText(
  session: AgentSession | null,
  text: string,
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
    if (previous && previous.end === start && !toolStartsHere) {
      textSegments[textSegments.length - 1] = {
        ...previous,
        end,
        text: `${previous.text}${text}`,
      };
    } else {
      textSegments.push({ start, end, text });
    }
    assistant.textSegments = textSegments;
  });
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
