import type { ToolResult } from "@meith/shared";
import { useCallback, useEffect, useRef, useState } from "react";

/** A single changed file with its unified diff and line counts. */
export interface GitDiffFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  binary: boolean;
  diff: string;
}

/** The summarized working-tree diff for a project directory. */
export interface GitDiffResult {
  isRepo: boolean;
  root: string | null;
  files: GitDiffFile[];
  totalAdditions: number;
  totalDeletions: number;
}

const EMPTY: GitDiffResult = {
  isRepo: false,
  root: null,
  files: [],
  totalAdditions: 0,
  totalDeletions: 0,
};

type CallFn = (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;

interface UseGitDiffOptions {
  /** Re-fetch automatically on this interval (ms). 0 disables polling. */
  pollMs?: number;
  /** Bump this (e.g. file-event count) to trigger an immediate refetch. */
  refreshKey?: number | string;
}

/**
 * Fetches the working-tree diff for `cwd` via the `git_diff` tool and keeps it
 * fresh. Shared by the top-bar diff chip and the diff surface so both show the
 * same numbers. Re-fetches when `cwd`/`refreshKey` change and on `pollMs`.
 */
export function useGitDiff(
  call: CallFn,
  cwd: string | null | undefined,
  { pollMs = 0, refreshKey }: UseGitDiffOptions = {},
) {
  const [data, setData] = useState<GitDiffResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track the in-flight cwd so a slow response for an old project can't clobber
  // a newer one.
  const latestCwd = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!cwd) {
      setData(EMPTY);
      setError(null);
      return;
    }
    latestCwd.current = cwd;
    setLoading(true);
    try {
      const res = await call("git_diff", { cwd });
      if (latestCwd.current !== cwd) return; // superseded
      if (res.ok && res.content) {
        setData(res.content as GitDiffResult);
        setError(null);
      } else {
        setData(EMPTY);
        setError(res.error?.message ?? "Failed to read git diff");
      }
    } catch (err) {
      if (latestCwd.current !== cwd) return;
      setData(EMPTY);
      setError(err instanceof Error ? err.message : "Failed to read git diff");
    } finally {
      if (latestCwd.current === cwd) setLoading(false);
    }
  }, [call, cwd]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    if (!pollMs || !cwd) return;
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [pollMs, cwd, refresh]);

  return { data, loading, error, refresh };
}
