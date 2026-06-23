import type { AcpPreset, WorkspaceTab } from "@meith/shared";
import {
  BotIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  SendIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { MeithBridge } from "../../../bridge.js";
import { useAgent } from "../hooks/useAgent";
import { useResizable } from "../hooks/useResizable";
import { AgentMessageList } from "./AgentMessageList";
import { AgentModelSwitcher } from "./AgentModelSwitcher";
import { AgentPermissionCard } from "./AgentPermissionCard";
import { AgentSelector } from "./AgentSelector";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface AgentViewProps {
  tab: WorkspaceTab;
  bridge: MeithBridge;
}

/** The agent chat workspace tab: session list, transcript, composer. */
export function AgentView({ tab, bridge }: AgentViewProps) {
  const defaults = useMemo(
    () => ({ cwd: tab.cwd, spaceId: tab.spaceId ?? null }),
    [tab.cwd, tab.spaceId],
  );
  const agent = useAgent(bridge, defaults);
  const [draft, setDraft] = useState("");
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false);
  const sidebar = useResizable({
    initial: 224,
    min: 180,
    max: 360,
    axis: "x",
    storageKey: "meith.agentSessionsWidth",
  });

  const running = agent.session?.status === "running";

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || running) return;
    setDraft("");
    await agent.send(text);
  };

  const handleAgentChange = async (preset: AcpPreset) => {
    // Clear the model/reasoning overrides so the newly selected agent falls back
    // to its own advertised defaults instead of the previous agent's values.
    if (agent.session) await agent.setSessionModel({ model: "", reasoning: "" });
    await agent.saveConfig({ adapter: "acp", acpPreset: preset });
  };

  return (
    <div className="flex h-full w-full min-w-0 overflow-hidden bg-background">
      {/* Session sidebar (collapsible + resizable) */}
      {sessionsCollapsed ? (
        <div className="flex shrink-0 flex-col items-center gap-1 border-r border-border py-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => setSessionsCollapsed(false)}
                  aria-label="Show sessions"
                >
                  <PanelLeftOpenIcon className="size-4" aria-hidden />
                </Button>
              }
            />
            <TooltipContent side="right">Show sessions</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => void agent.createSession()}
                  aria-label="New session"
                >
                  <PlusIcon className="size-4" aria-hidden />
                </Button>
              }
            />
            <TooltipContent side="right">New session</TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <>
          <aside className="flex shrink-0 flex-col" style={{ width: sidebar.size }}>
            <div className="flex items-center justify-between gap-1 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Sessions
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => void agent.createSession()}
                  aria-label="New session"
                >
                  <PlusIcon className="size-4" aria-hidden />
                </Button>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => setSessionsCollapsed(true)}
                        aria-label="Collapse sessions"
                      >
                        <PanelLeftCloseIcon className="size-4" aria-hidden />
                      </Button>
                    }
                  />
                  <TooltipContent>Collapse sessions</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {agent.sessions.length === 0 && (
                <p className="px-2 py-4 text-xs text-muted-foreground">
                  No sessions yet.
                </p>
              )}
              {agent.sessions.map((s) => {
                const active = s.id === agent.activeId;
                return (
                  <div
                    key={s.id}
                    className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground hover:bg-accent/50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void agent.selectSession(s.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <BotIcon
                        className="size-3.5 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                      <span className="flex-1 truncate">{s.title}</span>
                    </button>
                    <button
                      type="button"
                      aria-label="Delete session"
                      onClick={() => void agent.deleteSession(s.id)}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2Icon
                        className="size-3.5 text-muted-foreground hover:text-destructive"
                        aria-hidden
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </aside>
          {/* Resize handle */}
          <button
            type="button"
            aria-label="Resize sessions sidebar"
            onPointerDown={sidebar.onPointerDown}
            className="w-1 shrink-0 cursor-col-resize border-r border-border bg-transparent transition-colors hover:bg-primary/40 focus-visible:bg-primary/40 focus-visible:outline-none"
          />
        </>
      )}

      {/* Chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          {agent.session ? (
            <AgentMessageList session={agent.session} streaming={agent.streaming} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Create a session to start chatting.
            </div>
          )}
        </div>

        {/* Pending permission prompts */}
        {agent.permissions.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border bg-muted/30 p-3">
            {agent.permissions.map((req) => (
              <AgentPermissionCard
                key={req.toolCallId}
                request={req}
                onDecide={(r, decision, remember) =>
                  void agent.decide(r, decision, remember)
                }
              />
            ))}
          </div>
        )}

        {/* Composer */}
        <div className="border-t border-border p-3">
          <div className="flex flex-col gap-2 rounded-md border border-input bg-transparent px-1 pt-1 shadow-sm focus-within:ring-1 focus-within:ring-ring">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={2}
              placeholder="Message the agent…"
              aria-label="Message the agent"
              disabled={!agent.session}
              className="min-h-[2.5rem] w-full resize-none bg-transparent px-2 py-1.5 text-sm focus-visible:outline-none disabled:opacity-50"
            />
            <div className="flex items-center justify-between gap-2 px-1 pb-1">
              <div className="flex min-w-0 items-center gap-0.5">
                <AgentSelector
                  preset={agent.config?.acpPreset ?? "custom"}
                  disabled={!agent.session || running}
                  onChange={(preset) => void handleAgentChange(preset)}
                />
                <AgentModelSwitcher
                  options={agent.modelOptions}
                  loading={agent.modelOptionsLoading}
                  model={agent.session?.model ?? agent.config?.model ?? ""}
                  reasoning={agent.session?.reasoning ?? agent.config?.reasoning ?? ""}
                  disabled={!agent.session || running}
                  onChange={(patch) => void agent.setSessionModel(patch)}
                />
              </div>
              {running ? (
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => void agent.cancel()}
                  aria-label="Stop"
                >
                  <SquareIcon className="size-4" aria-hidden />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={() => void handleSend()}
                  disabled={!draft.trim() || !agent.session}
                  aria-label="Send"
                >
                  <SendIcon className="size-4" aria-hidden />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
