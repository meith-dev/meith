import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { WORKSPACE_KINDS } from "@/lib/workspace";
import type { WorkspaceTab } from "@meith/shared";

/** Workspace kinds promoted to top-bar toggle buttons, in display order. */
const TOGGLE_KINDS = ["editor", "terminal", "agent"] as const;

interface TopBarWorkspaceTogglesProps {
  /** Workspace tabs scoped to the active space. */
  tabs: WorkspaceTab[];
  /** Ids of the tabs currently active (visible) in each pane. */
  activeTabIds: string[];
  /** Toggle the single tab of this kind: open, reveal, or close. */
  onToggle: (kind: WorkspaceTab["kind"]) => void;
}

/**
 * Single-instance workspace tab switches that live beside the brand mark. Each
 * kind (Editor / Terminal / Agent) can have at most one tab open in the active
 * space, so these buttons act as toggles: open it when absent, reveal it when
 * hidden, and close it when it is the visible tab.
 */
export function TopBarWorkspaceToggles({
  tabs,
  activeTabIds,
  onToggle,
}: TopBarWorkspaceTogglesProps) {
  return (
    <div className="flex items-center gap-1">
      {TOGGLE_KINDS.map((kind) => {
        const { icon: Icon, label } = WORKSPACE_KINDS[kind];
        const tab = tabs.find((t) => t.kind === kind);
        const isOpen = Boolean(tab);
        const isActive = tab ? activeTabIds.includes(tab.id) : false;
        return (
          <Tooltip key={kind}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => onToggle(kind)}
                  aria-pressed={isOpen}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive
                      ? "bg-accent text-foreground"
                      : isOpen
                        ? "text-foreground hover:bg-accent/60"
                        : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  <span>{label}</span>
                </button>
              }
            />
            <TooltipContent side="bottom">
              {isOpen ? `Close ${label}` : `Open ${label}`}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
