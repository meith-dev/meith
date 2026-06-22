import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useGitDiff } from "@/hooks/useGitDiff";
import type { ToolResult } from "@meith/shared";
import { GitCompareIcon } from "lucide-react";

interface TopBarGitDiffProps {
  /** Project root to inspect. Null hides the chip. */
  cwd: string | null;
  /** Typed tool invoker from the workbench. */
  call: (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;
  /** Open (or focus) the diff surface for this project. */
  onOpenDiff: () => void;
  /** Changes whenever workspace files change, to trigger a refetch. */
  refreshKey: number;
}

/**
 * Compact git-diff indicator for the top bar, sitting beside the run status.
 * Shows the working-tree's total +added / -removed line counts across changed
 * files; clicking opens a dedicated diff tab. Hidden when the project isn't a
 * git repo or has no changes.
 */
export function TopBarGitDiff({ cwd, call, onOpenDiff, refreshKey }: TopBarGitDiffProps) {
  const { data, loading } = useGitDiff(call, cwd, { pollMs: 8000, refreshKey });

  // Nothing to show until we know it's a repo with at least one change.
  if (!cwd || !data.isRepo || data.files.length === 0) return null;

  const fileCount = data.files.length;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onOpenDiff}
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
      <TooltipContent>
        {fileCount} changed file{fileCount === 1 ? "" : "s"} — click to view diff
      </TooltipContent>
    </Tooltip>
  );
}
