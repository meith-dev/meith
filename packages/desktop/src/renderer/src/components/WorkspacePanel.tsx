import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { WORKSPACE_KINDS, basename } from "@/lib/workspace";
import type { WorkspaceTab } from "@meith/shared";
import { PlusIcon, XIcon } from "lucide-react";

interface WorkspacePanelProps {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  onFocus: (id: string) => void;
  onClose: (id: string) => void;
  onOpen: (kind: WorkspaceTab["kind"]) => void;
}

/**
 * Left workspace column: the project/editor/terminal/agent/preview tabs that
 * live in the active space. Acts as the "workspace tab strip" from the spec.
 */
export function WorkspacePanel({
  tabs,
  activeTabId,
  onFocus,
  onClose,
  onOpen,
}: WorkspacePanelProps) {
  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Workspace
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Open workspace tab"
          >
            <PlusIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {(Object.keys(WORKSPACE_KINDS) as WorkspaceTab["kind"][]).map((kind) => {
                const { icon: Icon, label } = WORKSPACE_KINDS[kind];
                return (
                  <DropdownMenuItem key={kind} onClick={() => onOpen(kind)}>
                    <Icon className="size-4" />
                    {label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1">
        <ul className="flex flex-col gap-0.5 px-2 pb-2">
          {tabs.map((tab) => {
            const { icon: Icon, label } = WORKSPACE_KINDS[tab.kind];
            const active = tab.id === activeTabId;
            return (
              <li key={tab.id}>
                <div
                  className={cn(
                    "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onFocus(tab.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
                  >
                    <Icon
                      className={cn("size-4 shrink-0", active && "text-primary")}
                    />
                    <span className="min-w-0 flex-1 truncate" title={tab.cwd}>
                      {tab.title}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                      {label}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onClose(tab.id)}
                    aria-label={`Close ${tab.title}`}
                    className="flex size-4 shrink-0 items-center justify-center rounded opacity-0 hover:bg-background group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
                  >
                    <XIcon className="size-3" />
                  </button>
                </div>
              </li>
            );
          })}

          {tabs.length === 0 && (
            <li className="px-2 py-6 text-center text-xs text-muted-foreground">
              No workspace tabs. Use <span className="text-foreground">+</span> to open
              one.
            </li>
          )}
        </ul>
      </ScrollArea>

      <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        {tabs.length > 0 && activeTabId && (
          <span className="block truncate" title={cwdOf(tabs, activeTabId)}>
            {basename(cwdOf(tabs, activeTabId))}
          </span>
        )}
      </div>
    </div>
  );
}

function cwdOf(tabs: WorkspaceTab[], id: string): string {
  return tabs.find((t) => t.id === id)?.cwd ?? "";
}
