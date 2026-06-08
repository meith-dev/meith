import type { Space } from "@meith/shared";
import { PlusIcon, TerminalSquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SpacesRailProps {
  spaces: Space[];
  activeSpaceId: string | null;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onManage: (space: Space) => void;
}

/**
 * Far-left vertical rail of spaces (workspaces). Each space is a colored dot
 * with its initial; the active one is ringed. Mirrors the Arc/VS Code profile
 * switcher idiom and keeps the chrome dense.
 */
export function SpacesRail({
  spaces,
  activeSpaceId,
  onSwitch,
  onCreate,
  onManage,
}: SpacesRailProps) {
  return (
    <nav
      aria-label="Spaces"
      className="flex w-14 shrink-0 flex-col items-center gap-2 border-r border-sidebar-border bg-sidebar py-3"
    >
      <div className="flex size-9 items-center justify-center rounded-md bg-primary/15 text-primary">
        <TerminalSquareIcon className="size-5" />
      </div>
      <div className="my-1 h-px w-6 bg-sidebar-border" />

      <div className="flex flex-1 flex-col items-center gap-2">
        {spaces.map((space) => {
          const active = space.id === activeSpaceId;
          return (
            <Tooltip key={space.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Switch to ${space.name}`}
                  aria-current={active}
                  onClick={() => onSwitch(space.id)}
                  onDoubleClick={() => onManage(space)}
                  className={cn(
                    "relative flex size-9 items-center justify-center rounded-md text-sm font-semibold text-white transition-transform",
                    "hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active && "ring-2 ring-offset-2 ring-offset-sidebar",
                  )}
                  style={{
                    backgroundColor: space.color ?? "var(--primary)",
                    ...ringColor(space, active),
                  }}
                >
                  {space.name.slice(0, 1).toUpperCase()}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {space.name}
                <span className="ml-1 text-muted-foreground">(double-click to edit)</span>
              </TooltipContent>
            </Tooltip>
          );
        })}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 text-muted-foreground"
              onClick={onCreate}
              aria-label="Create space"
            >
              <PlusIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">New space</TooltipContent>
        </Tooltip>
      </div>
    </nav>
  );
}

/** Tint the focus ring to the space color when active. */
function ringColor(space: Space, active: boolean): Record<string, string> {
  return active ? { "--tw-ring-color": space.color ?? "var(--primary)" } : {};
}
