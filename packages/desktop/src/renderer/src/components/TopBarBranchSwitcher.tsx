import { OverlayDropdown } from "@/components/OverlayDropdown";
import type { OverlayActionItem } from "@/lib/overlay";
import type { ToolResult } from "@meith/shared";
import {
  CheckIcon,
  ChevronDownIcon,
  GitBranchIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

interface TopBarBranchSwitcherProps {
  cwd: string | null;
  call: (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;
  refreshKey: number;
  onChanged?: () => void;
}

interface GitBranchSummary {
  name: string;
  current: boolean;
  upstream: string | null;
  commit: string;
  subject: string;
}

export function TopBarBranchSwitcher({
  cwd,
  call,
  refreshKey,
  onChanged,
}: TopBarBranchSwitcherProps) {
  const [branches, setBranches] = useState<GitBranchSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const createInputRef = useRef<HTMLInputElement | null>(null);

  const currentBranch = useMemo(
    () => branches.find((branch) => branch.current) ?? null,
    [branches],
  );
  const orderedBranches = useMemo(
    () =>
      [...branches].sort((a, b) => {
        if (a.current !== b.current) return a.current ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [branches],
  );

  const refresh = useCallback(async () => {
    if (!cwd) {
      setBranches([]);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const result = await call("git_branch", { cwd, action: "list" });
      if (!result.ok) throw new Error(result.error?.message ?? "Failed to load branches");
      setBranches((result.content as GitBranchSummary[]) ?? []);
      setError(null);
    } catch (err) {
      setBranches([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [call, cwd]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    if (!creatingBranch) return;
    createInputRef.current?.focus();
  }, [creatingBranch]);

  const switchBranch = useCallback(
    async (name: string) => {
      if (!cwd || busy || name === currentBranch?.name) return;
      setBusy(true);
      try {
        const result = await call("git_branch", { cwd, action: "switch", name });
        if (!result.ok)
          throw new Error(result.error?.message ?? "Failed to switch branch");
        setBranches((result.content as GitBranchSummary[]) ?? []);
        setError(null);
        onChanged?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        toast.error(message);
      } finally {
        setBusy(false);
      }
    },
    [busy, call, currentBranch?.name, cwd, onChanged],
  );

  const createBranch = useCallback(
    async (rawName: string) => {
      const name = rawName.trim();
      if (!cwd || busy || !name) return false;
      setBusy(true);
      try {
        const created = await call("git_branch", { cwd, action: "create", name });
        if (!created.ok) {
          throw new Error(created.error?.message ?? "Failed to create branch");
        }
        const switched = await call("git_branch", { cwd, action: "switch", name });
        if (!switched.ok) {
          throw new Error(
            switched.error?.message ?? "Created branch but failed to switch",
          );
        }
        setBranches((switched.content as GitBranchSummary[]) ?? []);
        setError(null);
        setCreatingBranch(false);
        setNewBranchName("");
        onChanged?.();
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        toast.error(message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, call, cwd, onChanged],
  );

  const promptForBranch = useCallback(() => {
    if (busy) return;
    setError(null);
    setNewBranchName("");
    setCreatingBranch(true);
  }, [busy]);

  const submitBranchCreate = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void createBranch(newBranchName);
    },
    [createBranch, newBranchName],
  );

  const cancelBranchCreate = useCallback(() => {
    if (busy) return;
    setCreatingBranch(false);
    setNewBranchName("");
  }, [busy]);

  const items = useMemo<OverlayActionItem[]>(() => {
    const branchItems: OverlayActionItem[] =
      orderedBranches.length === 0
        ? [
            {
              id: "__none",
              label: "No branches found",
              disabled: true,
              onSelect: () => undefined,
            },
          ]
        : orderedBranches.map((branch) => ({
            id: `branch:${branch.name}`,
            label: branch.name,
            description: branch.upstream ?? branch.subject ?? branch.commit,
            checked: branch.current,
            disabled: busy || branch.current,
            iconName: "git",
            onSelect: () => void switchBranch(branch.name),
          }));

    return [
      ...(error
        ? [
            {
              id: "__error",
              label: error,
              disabled: true,
              variant: "destructive" as const,
              onSelect: () => undefined,
            },
          ]
        : []),
      ...branchItems,
      {
        id: "__create",
        label: "Create new branch…",
        description: "Create from the current HEAD and switch to it.",
        iconName: "git",
        separatorBefore: true,
        pinned: "bottom",
        disabled: busy || !cwd,
        onSelect: promptForBranch,
      },
    ];
  }, [busy, cwd, error, orderedBranches, promptForBranch, switchBranch]);

  if (!cwd || (!loading && branches.length === 0 && !error)) return null;

  const disabled = loading || busy;
  const label = currentBranch?.name ?? (loading ? "Loading" : "No branch");

  if (creatingBranch) {
    return (
      <form
        className="flex h-7 w-72 max-w-[min(18rem,40vw)] items-center gap-1 rounded-md border border-border bg-card px-1.5 text-[11px] shadow-sm"
        onSubmit={submitBranchCreate}
      >
        {busy ? (
          <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <input
          ref={createInputRef}
          value={newBranchName}
          onChange={(event) => setNewBranchName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") cancelBranchCreate();
          }}
          disabled={busy}
          placeholder="new-branch"
          aria-label="New branch name"
          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || newBranchName.trim().length === 0}
          title="Create and switch branch"
          aria-label="Create and switch branch"
          className="grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <CheckIcon className="size-3.5" />
        </button>
        <button
          type="button"
          disabled={busy}
          title="Cancel"
          aria-label="Cancel branch creation"
          className="grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          onClick={cancelBranchCreate}
        >
          <XIcon className="size-3.5" />
        </button>
      </form>
    );
  }

  return (
    <OverlayDropdown
      align="end"
      minWidth={288}
      maxWidth={360}
      maxHeight={360}
      items={items}
      trigger={
        <button
          type="button"
          disabled={disabled && branches.length === 0}
          title="Switch or create a Git branch"
          className="flex h-7 max-w-48 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-[11px] font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
          aria-label={`Current git branch: ${label}`}
        >
          {loading ? (
            <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
          ) : (
            <GitBranchIcon className="size-3.5 text-muted-foreground" />
          )}
          <span className="truncate">{label}</span>
          <ChevronDownIcon className="size-3 text-muted-foreground" />
        </button>
      }
    />
  );
}
