import { OverlayDropdown } from "@/components/OverlayDropdown";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DevServer, Project } from "@meith/shared";
import { ChevronDownIcon, PlayIcon, SquareIcon } from "lucide-react";

interface TopBarRunProps {
  /** The active workspace's project, if any. */
  project: Project | null;
  /** The dev server currently running for this project, if any. */
  runningServer: DevServer | null;
  /** Run a configured command (or the default when omitted). */
  onRun: (commandId?: string) => void;
  /** Stop the running server. */
  onStop: () => void;
  /** Open Settings focused on the Run tab. */
  onOpenRunSettings: () => void;
  /** Open (or focus) a browser tab pointed at the running server's port. */
  onOpenPort: (port: number) => void;
  /** Notifies when the command picker opens/closes (to yield the native view). */
  onMenuOpenChange?: (open: boolean) => void;
}

/**
 * Compact run controls for the top bar. The old left workspace panel is gone,
 * so running the active project's command now lives inline next to the tab
 * strip: a primary Run/Stop button, a command picker, and a live port chip.
 */
export function TopBarRun({
  project,
  runningServer,
  onRun,
  onStop,
  onOpenRunSettings,
  onOpenPort,
  onMenuOpenChange,
}: TopBarRunProps) {
  const running =
    runningServer?.status === "running" || runningServer?.status === "starting";
  const commands = project?.runConfig.commands ?? [];
  const defaultCmd =
    commands.find((c) => c.id === project?.runConfig.defaultCommandId) ??
    commands[0] ??
    null;
  const hasProject = Boolean(project);

  return (
    <div className="flex items-center gap-1.5">
      {running && runningServer?.port != null && (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => onOpenPort(runningServer.port as number)}
                className="flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 font-mono text-[11px] text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />:
                {runningServer.port}
              </button>
            }
          />
          <TooltipContent>Open localhost:{runningServer.port} in a tab</TooltipContent>
        </Tooltip>
      )}

      <div className="flex items-stretch">
        {running ? (
          <Button
            variant="destructive"
            size="sm"
            className="h-7 gap-1.5 rounded-r-none"
            onClick={onStop}
          >
            <SquareIcon className="size-3.5 fill-current" />
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-7 gap-1.5 rounded-r-none"
            disabled={!hasProject}
            onClick={() => onRun()}
          >
            <PlayIcon className="size-3.5 fill-current" />
            Run {defaultCmd?.label ?? "Dev"}
          </Button>
        )}

        {/* Command picker — rendered in the overlay window so it floats above
            the native browser view (falls back to an in-DOM menu in preview). */}
        <OverlayDropdown
          align="end"
          minWidth={208}
          onOpenChange={onMenuOpenChange}
          items={[
            ...(commands.length === 0
              ? [
                  {
                    id: "__none",
                    label: "No commands configured",
                    disabled: true,
                    onSelect: () => undefined,
                  },
                ]
              : commands.map((c) => ({
                  id: c.id,
                  label: c.label,
                  iconName: "play",
                  hint: c.command,
                  onSelect: () => onRun(c.id),
                }))),
            {
              id: "__configure",
              label: "Configure commands…",
              iconName: "settings",
              separatorBefore: true,
              onSelect: onOpenRunSettings,
            },
          ]}
          trigger={
            <button
              type="button"
              disabled={!hasProject}
              // Match the sibling Button's fill inset: it has a transparent
              // border + `bg-clip-padding`, so its colored fill is 1px shorter
              // than its box. Without these the chevron's fill would look taller.
              // The left border doubles as the divider between the two halves.
              className="flex h-7 w-6 items-center justify-center rounded-md rounded-l-none border border-transparent border-l-primary-foreground/20 bg-primary bg-clip-padding text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[running=true]:bg-destructive data-[running=true]:text-destructive-foreground"
              data-running={running}
              aria-label="Choose run command"
            >
              <ChevronDownIcon className="size-3.5" />
            </button>
          }
        />
      </div>
    </div>
  );
}
