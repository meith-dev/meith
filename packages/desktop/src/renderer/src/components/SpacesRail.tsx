import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Space } from "@meith/shared";
import {
  FolderOpenIcon,
  InfoIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  TerminalSquare,
  Trash2Icon,
} from "lucide-react";
import { type MouseEvent, memo, useEffect, useState } from "react";

interface SpacesRailProps {
  spaces: Space[];
  activeSpaceId: string | null;
  onSwitch: (id: string) => void;
  onCreate: () => void;
  onOpenFolder: () => void;
  onRename: (space: Space) => void;
  onDelete: (space: Space) => void;
  onInfo: (space: Space) => void;
  onOpenSettings: () => void;
  /** Whether the settings view is open (highlights the button). */
  settingsOpen: boolean;
  /** Whether the diagnostics drawer is open (highlights the button). */
  debugOpen: boolean;
  onToggleDebug: () => void;
}

type SpaceMenuState = {
  space: Space;
  x: number;
  y: number;
};

/**
 * Far-left vertical rail of spaces (workspaces). Each space is 1:1 with a
 * project: a colored dot with the project's initial; the active one is ringed.
 * The "+" creates an empty workspace; the folder button opens an existing
 * folder as a project. Mirrors the Arc/VS Code profile switcher idiom.
 */
export const SpacesRail = memo(function SpacesRail({
  spaces,
  activeSpaceId,
  onSwitch,
  onCreate,
  onOpenFolder,
  onRename,
  onDelete,
  onInfo,
  onOpenSettings,
  settingsOpen,
  debugOpen,
  onToggleDebug,
}: SpacesRailProps) {
  const [menu, setMenu] = useState<SpaceMenuState | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  const openMenu = (event: MouseEvent, space: Space) => {
    event.preventDefault();
    const width = 208;
    const height = 160;
    setMenu({
      space,
      x: Math.min(event.clientX, window.innerWidth - width - 8),
      y: Math.min(event.clientY, window.innerHeight - height - 8),
    });
  };

  const runMenuAction = (action: (space: Space) => void) => {
    if (!menu) return;
    const space = menu.space;
    setMenu(null);
    action(space);
  };

  return (
    <nav
      aria-label="Spaces"
      className="flex w-14 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-3"
    >
      {/* Scrollable spaces list, bounded so it never overflows the rail.
          `w-full` spans the full rail width: the nav's `items-center` would
          otherwise shrink-wrap this column to the avatar width, so the active
          ring (`ring-offset-2`) and `hover:scale-105` would spill past the
          scrollport edge and get clipped by the forced `overflow-x`. */}
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-y-auto py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {spaces.map((space) => {
          const active = space.id === activeSpaceId;
          return (
            <Tooltip key={space.id}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={`Switch to ${space.name}`}
                    aria-current={active}
                    onClick={() => onSwitch(space.id)}
                    onDoubleClick={() => onRename(space)}
                    onContextMenu={(e) => openMenu(e, space)}
                    className={cn(
                      "relative flex size-9 shrink-0 items-center justify-center rounded-md text-sm font-semibold text-white transition-transform",
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
                }
              />
              <TooltipContent side="right">{space.name}</TooltipContent>
            </Tooltip>
          );
        })}

        {/* Directly under the open workspaces: create / open folder. */}
        <div className="h-px w-7 bg-sidebar-border" />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 text-muted-foreground"
                onClick={onCreate}
                aria-label="New workspace"
              >
                <PlusIcon />
              </Button>
            }
          />
          <TooltipContent side="right">New workspace</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 text-muted-foreground"
                onClick={onOpenFolder}
                aria-label="Open folder as project"
              >
                <FolderOpenIcon />
              </Button>
            }
          />
          <TooltipContent side="right">Open folder…</TooltipContent>
        </Tooltip>
      </div>

      {/* Pinned bottom cluster: diagnostics / global settings. */}
      <div className="flex shrink-0 flex-col items-center gap-2 pt-2">
        <div className="h-px w-7 bg-sidebar-border" />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant={debugOpen ? "secondary" : "ghost"}
                size="icon"
                className="size-9 text-muted-foreground"
                onClick={onToggleDebug}
                aria-label="Toggle diagnostics"
              >
                <TerminalSquare />
              </Button>
            }
          />
          <TooltipContent side="right">Toggle diagnostics ({"\u2318"}J)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant={settingsOpen ? "secondary" : "ghost"}
                size="icon"
                className="size-9 text-muted-foreground"
                onClick={onOpenSettings}
                aria-label={settingsOpen ? "Close settings" : "Open settings"}
                aria-pressed={settingsOpen}
              >
                <SettingsIcon />
              </Button>
            }
          />
          <TooltipContent side="right">
            {settingsOpen ? "Close settings" : "Settings"}
          </TooltipContent>
        </Tooltip>
      </div>

      {menu && (
        <div
          role="menu"
          aria-label={`${menu.space.name} workspace menu`}
          className="fixed z-50 w-52 rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="px-2 py-1.5">
            <div className="truncate font-medium">{menu.space.name}</div>
            <div className="text-xs text-muted-foreground">Workspace</div>
          </div>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus:bg-accent"
            onClick={() => runMenuAction(onRename)}
          >
            <PencilIcon className="size-4" />
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus:bg-accent"
            onClick={() => runMenuAction(onInfo)}
          >
            <InfoIcon className="size-4" />
            Get Info
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-destructive outline-none hover:bg-destructive/10 focus:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
            disabled={spaces.length <= 1}
            onClick={() => runMenuAction(onDelete)}
          >
            <Trash2Icon className="size-4" />
            Delete
          </button>
        </div>
      )}
    </nav>
  );
});

/** Tint the focus ring to the space color when active. */
function ringColor(space: Space, active: boolean): Record<string, string> {
  return active ? { "--tw-ring-color": space.color ?? "var(--primary)" } : {};
}
