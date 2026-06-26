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
  /** Fetch full unified patches. Summary-only calls are much cheaper. */
  includePatches?: boolean;
}

const CACHE_TTL_MS = 2_000;
const cache = new Map<string, { data: GitDiffResult; ts: number }>();
const inflight = new Map<string, Promise<GitDiffResult>>();

function cacheKey(cwd: string, includePatches: boolean): string {
  return `${includePatches ? "patch" : "summary"}:${cwd}`;
}

async function fetchGitDiff(
  call: CallFn,
  cwd: string,
  includePatches: boolean,
  force = false,
): Promise<GitDiffResult> {
  const key = cacheKey(cwd, includePatches);
  const cached = cache.get(key);
  if (!force && cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;
  const existing = inflight.get(key);
  if (!force && existing) return existing;

  const promise = call("git_diff", { cwd, includePatches }).then((res) => {
    if (res.ok && res.content) {
      const data = res.content as GitDiffResult;
      cache.set(key, { data, ts: Date.now() });
      return data;
    }
    throw new Error(res.error?.message ?? "Failed to read git diff");
  });
  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    if (inflight.get(key) === promise) inflight.delete(key);
  }
}

/**
 * Fetches the working-tree diff for `cwd` via the `git_diff` tool and keeps it
 * fresh. Shared by the top-bar diff chip and the diff surface so both show the
 * same numbers. Re-fetches when `cwd`/`refreshKey` change and on `pollMs`.
 */
export function useGitDiff(
  call: CallFn,
  cwd: string | null | undefined,
  { pollMs = 0, refreshKey, includePatches = false }: UseGitDiffOptions = {},
) {
  const [data, setData] = useState<GitDiffResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track the in-flight cwd so a slow response for an old project can't clobber
  // a newer one.
  const latestCwd = useRef<string | null>(null);
  const lastRefreshKey = useRef(refreshKey);

  const refresh = useCallback(
    async (force = false) => {
      if (!cwd) {
        setData(EMPTY);
        setError(null);
        return;
      }
      latestCwd.current = cwd;
      setLoading(true);
      try {
        const data = await fetchGitDiff(call, cwd, includePatches, force);
        if (latestCwd.current !== cwd) return; // superseded
        setData(data);
        setError(null);
      } catch (err) {
        if (latestCwd.current !== cwd) return;
        setData(EMPTY);
        setError(err instanceof Error ? err.message : "Failed to read git diff");
      } finally {
        if (latestCwd.current === cwd) setLoading(false);
      }
    },
    [call, cwd, includePatches],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (lastRefreshKey.current === refreshKey) return;
    lastRefreshKey.current = refreshKey;
    void refresh(true);
  }, [refresh, refreshKey]);

  useEffect(() => {
    if (!pollMs || !cwd) return;
    const id = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(id);
  }, [pollMs, cwd, refresh]);

  return { data, loading, error, refresh };
}
