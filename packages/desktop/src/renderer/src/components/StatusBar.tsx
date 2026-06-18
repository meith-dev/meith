import { cn } from "@/lib/utils";
import { Circle, PlayIcon } from "lucide-react";

export function StatusBar({
  isMock,
  browserTabs,
  workspaceTabs,
  spaces,
  runningCount,
  activePort,
  onOpenOutput,
}: {
  isMock: boolean;
  browserTabs: number;
  workspaceTabs: number;
  spaces: number;
  /** Number of dev servers currently running/starting. */
  runningCount: number;
  /** Port of the active project's running server, if detected. */
  activePort: number | null;
  /** Open the Output panel. */
  onOpenOutput: () => void;
}) {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t bg-card px-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Circle
          className={cn(
            "size-2 fill-current",
            isMock ? "text-muted-foreground" : "text-primary",
          )}
        />
        {isMock ? "Mock bridge" : "Runtime connected"}
      </span>

      {runningCount > 0 && (
        <button
          type="button"
          onClick={onOpenOutput}
          className="flex items-center gap-1.5 rounded text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PlayIcon className="size-2.5 fill-current text-primary" />
          {runningCount} running
          {activePort != null && (
            <span className="font-mono text-primary">:{activePort}</span>
          )}
        </button>
      )}

      <div className="flex-1" />

      <span>{spaces} spaces</span>
      <span>{workspaceTabs} workspace tabs</span>
      <span>{browserTabs} browser tabs</span>
      <span className="font-mono">meith workbench</span>
    </footer>
  );
}
