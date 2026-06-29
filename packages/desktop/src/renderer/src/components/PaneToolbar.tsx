import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WORKSPACE_KINDS } from "@/lib/workspace";
import type { WorkspaceTab } from "@meith/shared";
import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  Settings2Icon,
  XIcon,
} from "lucide-react";

interface PaneToolbarProps {
  kind: WorkspaceTab["kind"];
  title: string;
  onClose: () => void;
  /** Provided only for agent surfaces — opens Settings on the Agent tab. */
  onOpenAgentSettings?: () => void;
  /** Provided only for agent surfaces — hides or restores the sessions sidebar. */
  agentSessionsCollapsed?: boolean;
  onToggleAgentSessions?: () => void;
}

/**
 * A slim, shared header for whichever workspace surface fills the workspace
 * pane. It centralizes tab-level actions (close/settings/session sidebar) so
 * every surface kind gets a consistent control bar.
 */
export function PaneToolbar({
  kind,
  title,
  onClose,
  onOpenAgentSettings,
  agentSessionsCollapsed = false,
  onToggleAgentSessions,
}: PaneToolbarProps) {
  const { icon: Icon, label } = WORKSPACE_KINDS[kind];
  return (
    <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-card/40 px-3">
      {kind === "agent" && onToggleAgentSessions && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant={agentSessionsCollapsed ? "secondary" : "ghost"}
                className="size-7"
                onClick={onToggleAgentSessions}
                aria-label={agentSessionsCollapsed ? "Show sessions" : "Hide sessions"}
              >
                {agentSessionsCollapsed ? (
                  <PanelLeftOpenIcon className="size-4" aria-hidden />
                ) : (
                  <PanelLeftCloseIcon className="size-4" aria-hidden />
                )}
              </Button>
            }
          />
          <TooltipContent>
            {agentSessionsCollapsed ? "Show sessions" : "Hide sessions"}
          </TooltipContent>
        </Tooltip>
      )}

      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>
        {title}
      </span>

      {kind === "agent" && onOpenAgentSettings && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={onOpenAgentSettings}
                aria-label="Agent settings"
              >
                <Settings2Icon className="size-4" aria-hidden />
              </Button>
            }
          />
          <TooltipContent>Agent settings</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={onClose}
              aria-label={`Close ${label.toLowerCase()}`}
            >
              <XIcon className="size-4" aria-hidden />
            </Button>
          }
        />
        <TooltipContent>Close tab</TooltipContent>
      </Tooltip>
    </header>
  );
}
