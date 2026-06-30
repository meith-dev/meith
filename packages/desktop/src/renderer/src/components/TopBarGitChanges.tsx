import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useGitChanges } from "@/hooks/useGitChanges";
import type { GitSettings, ToolResult } from "@meith/shared";
import { GitCompareIcon } from "lucide-react";

interface TopBarGitChangesProps {
  /** Project root to inspect. Null hides the chip. */
  cwd: string | null;
  /** Typed tool invoker from the workbench. */
  call: (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;
  /** Open (or focus) the Git panel for this project. */
  onOpenGitPanel: () => void;
  settings?: GitSettings;
  /** Changes whenever workspace files change, to trigger a refetch. */
  refreshKey: number;
}

/**
 * Compact git-change indicator for the top bar, sitting beside the run status.
 * Shows the working-tree's total +added / -removed line counts across changed
 * files; clicking opens the Git panel. Hidden when the project isn't a
 * git repo or has no changes.
 */
export function TopBarGitChanges({
  cwd,
  call,
  onOpenGitPanel,
  settings,
  refreshKey,
}: TopBarGitChangesProps) {
  const { data, loading } = useGitChanges(call, cwd, {
    pollMs: settings?.refreshIntervalMs ?? 2500,
    forcePoll: true,
    refreshKey,
    includePatches: false,
  });

  // Nothing to show until we know it's a repo with at least one change.
  if (!cwd || !data.isRepo || data.files.length === 0) return null;

  const fileCount = data.files.length;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => onOpenGitPanel()}
            data-loading={loading}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[loading=true]:opacity-70"
            aria-label={`View ${fileCount} changed file${fileCount === 1 ? "" : "s"}: ${data.totalAdditions} additions, ${data.totalDeletions} deletions`}
          >
            <GitCompareIcon className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              +{data.totalAdditions}
            </span>
            <span className="font-mono tabular-nums text-rose-600 dark:text-rose-400">
              -{data.totalDeletions}
            </span>
          </button>
        }
      />
      <TooltipContent side="bottom">
        {fileCount} changed file{fileCount === 1 ? "" : "s"} - open Git panel
      </TooltipContent>
    </Tooltip>
  );
}
