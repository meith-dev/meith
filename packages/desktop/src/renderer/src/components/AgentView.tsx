import type { WorkspaceTab } from "@meith/shared";
import {
  BotIcon,
  PlusIcon,
  SendIcon,
  Settings2Icon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { MeithBridge } from "../../../bridge.js";
import { useAgent } from "../hooks/useAgent";
import { AgentConfigDialog } from "./AgentConfigDialog";
import { AgentMessageList } from "./AgentMessageList";
import { AgentPermissionCard } from "./AgentPermissionCard";
import { Button } from "./ui/button";

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
  const [settingsOpen, setSettingsOpen] = useState(false);

  const running = agent.session?.status === "running";

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || running) return;
    setDraft("");
    await agent.send(text);
  };

  return (
    <div className="flex h-full w-full bg-background">
      {/* Session sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sessions
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => void agent.createSession()}
            aria-label="New session"
          >
            <PlusIcon className="size-4" aria-hidden />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {agent.sessions.length === 0 && (
            <p className="px-2 py-4 text-xs text-muted-foreground">No sessions yet.</p>
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

      {/* Chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border px-4 py-2">
          <BotIcon className="size-4 text-muted-foreground" aria-hidden />
          <span className="truncate text-sm font-medium">
            {agent.session?.title ?? "Agent"}
          </span>
          {agent.config && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {agent.config.adapter}
              {agent.config.autoAccept ? " · auto-accept" : ""}
            </span>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="ml-auto size-7"
            onClick={() => setSettingsOpen(true)}
            aria-label="Agent settings"
          >
            <Settings2Icon className="size-4" aria-hidden />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
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
          <div className="flex items-end gap-2">
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
              className="min-h-[2.5rem] flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
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

      {agent.config && (
        <AgentConfigDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          config={agent.config}
          onSave={(patch) => agent.saveConfig(patch)}
        />
      )}
    </div>
  );
}
