import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type GitDiffFile, useGitChanges } from "@/hooks/useGitChanges";
import { useResizable } from "@/hooks/useResizable";
import { cn } from "@/lib/utils";
import { basename } from "@/lib/workspace";
import type { GitSettings, ToolResult, WorkspaceTab } from "@meith/shared";
import {
  CheckIcon,
  ChevronRightIcon,
  FileDiffIcon,
  FilePlusIcon,
  FileXIcon,
  FolderIcon,
  FolderOpenIcon,
  GitCommitIcon,
  LightbulbIcon,
  RefreshCwIcon,
  RotateCcwIcon,
} from "lucide-react";
import { type ReactElement, useCallback, useEffect, useMemo, useState } from "react";
import type { MeithBridge } from "../../../bridge";

interface GitPanelProps {
  tab: WorkspaceTab;
  call: (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;
  bridge: MeithBridge;
  settings?: GitSettings;
  /** Bumped when workspace files change, to refetch git state. */
  refreshKey: number;
}

interface DiffTreeDir {
  type: "dir";
  path: string;
  name: string;
  children: DiffTreeNode[];
  fileCount: number;
  additions: number;
  deletions: number;
}

interface DiffTreeFile {
  type: "file";
  path: string;
  name: string;
  file: GitDiffFile;
}

type DiffTreeNode = DiffTreeDir | DiffTreeFile;
type GitScope = "staged" | "unstaged";
type TooltipSide = "top" | "bottom" | "left" | "right";

interface GitStatusFile {
  path: string;
  status: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

interface GitStatusResult {
  isRepo: boolean;
  root: string | null;
  branch: string | null;
  ahead: number;
  behind: number;
  staged: GitStatusFile[];
  unstaged: GitStatusFile[];
  untracked: GitStatusFile[];
  clean: boolean;
}

/**
 * The Git panel: lists every changed file (vs HEAD, including untracked)
 * with its unified patch rendered as colored add/remove lines. Self-contained
 * — it fetches via the `git_diff` tool and refreshes on file changes.
 */
export function GitPanel({ tab, call, bridge, settings, refreshKey }: GitPanelProps) {
  const refreshIntervalMs = settings?.refreshIntervalMs ?? 2500;
  const showUntrackedFiles = settings?.showUntrackedFiles ?? true;
  const confirmBeforeRestore = settings?.confirmBeforeRestore ?? true;
  const { data, loading, error, refresh } = useGitChanges(call, tab.cwd, {
    refreshKey,
    pollMs: refreshIntervalMs,
    forcePoll: true,
    includePatches: false,
  });
  const [selectedPath, setSelectedPath] = useState<string | null>(
    tab.selectedGitFilePath ?? null,
  );
  const [selectedScope, setSelectedScope] = useState<GitScope>("unstaged");
  const [patchByPath, setPatchByPath] = useState<Record<string, GitDiffFile>>({});
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchError, setPatchError] = useState<string | null>(null);
  const [status, setStatus] = useState<GitStatusResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const activeIdentity =
    settings?.identityProfiles.find(
      (profile) => profile.id === settings.activeIdentityProfileId,
    ) ?? null;
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());
  const sidebar = useResizable({
    initial: 256,
    min: 180,
    max: 480,
    axis: "x",
    storageKey: "meith.gitSidebarWidth",
  });

  const summaryByPath = useMemo(
    () => new Map(data.files.map((file) => [file.path, file])),
    [data.files],
  );
  const stagedFiles = useMemo(
    () => filesForStatus(status?.staged ?? [], summaryByPath, "staged"),
    [status?.staged, summaryByPath],
  );
  const unstagedFiles = useMemo(
    () =>
      filesForStatus(
        [...(status?.unstaged ?? []), ...(status?.untracked ?? [])].filter(
          (file) => showUntrackedFiles || !file.untracked,
        ),
        summaryByPath,
        "unstaged",
      ),
    [status?.unstaged, status?.untracked, showUntrackedFiles, summaryByPath],
  );
  const fileTree = useMemo(
    () => ({
      staged: buildDiffTree(stagedFiles),
      unstaged: buildDiffTree(unstagedFiles),
    }),
    [stagedFiles, unstagedFiles],
  );
  const refreshStatus = useCallback(async () => {
    const res = await call("git_status", { cwd: tab.cwd });
    if (res.ok && res.content) setStatus(res.content as GitStatusResult);
  }, [call, tab.cwd]);
  const clearAndRefresh = useCallback(() => {
    setPatchByPath({});
    setPatchError(null);
    setActionError(null);
    void refresh(true);
    void refreshStatus();
  }, [refresh, refreshStatus]);
  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Keep a valid selection as the file list changes: default to the first
  // file, and recover if the selected file disappears from git status.
  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus, refreshKey]);

  useEffect(() => {
    const id = setInterval(() => void refreshStatus(), refreshIntervalMs);
    return () => clearInterval(id);
  }, [refreshStatus, refreshIntervalMs]);

  useEffect(() => {
    if (data.files.length === 0) {
      if (selectedPath !== null) setSelectedPath(null);
      return;
    }
    if (!selectedPath || !data.files.some((f) => f.path === selectedPath)) {
      const firstStaged = stagedFiles[0]?.path;
      const firstUnstaged = unstagedFiles[0]?.path;
      setSelectedPath(firstUnstaged ?? firstStaged ?? data.files[0].path);
      setSelectedScope(firstUnstaged ? "unstaged" : "staged");
    }
  }, [data.files, selectedPath, stagedFiles, unstagedFiles]);

  useEffect(() => {
    const persistedPath = tab.selectedGitFilePath ?? null;
    if (selectedPath === persistedPath) return;
    void call("set_workspace_tab_file", {
      tabId: tab.id,
      selectedGitFilePath: selectedPath,
    });
  }, [call, selectedPath, tab.id, tab.selectedGitFilePath]);

  // Keep selected files visible in the tree, and drop expansion entries for
  // directories that no longer exist after a git refresh.
  useEffect(() => {
    const validDirs = collectDirPaths([...fileTree.staged, ...fileTree.unstaged]);
    const selectedParents = selectedPath ? parentDirs(selectedPath) : [];
    setExpandedDirs((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const path of prev) {
        if (validDirs.has(path)) {
          next.add(path);
        } else {
          changed = true;
        }
      }
      for (const path of selectedParents) {
        if (!next.has(path)) {
          next.add(path);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [fileTree, selectedPath]);

  useEffect(() => {
    setPatchByPath({});
    setPatchError(null);
  }, [tab.cwd, refreshKey]);

  const selectedSummary = selectedPath ? (summaryByPath.get(selectedPath) ?? null) : null;
  const selectedPatchKey = selectedPath ? `${selectedScope}:${selectedPath}` : null;
  const selectedPatch = selectedPatchKey ? patchByPath[selectedPatchKey] : undefined;
  const selectedFile = selectedSummary
    ? { ...selectedSummary, ...(selectedPatch ?? {}) }
    : null;

  useEffect(() => {
    if (!tab.cwd || !data.isRepo || !selectedPath || !selectedSummary) {
      setPatchLoading(false);
      setPatchError(null);
      return;
    }
    if (selectedSummary.binary || selectedPatch?.diff) {
      setPatchLoading(false);
      setPatchError(null);
      return;
    }

    let cancelled = false;
    setPatchLoading(true);
    setPatchError(null);
    void call("git_diff", {
      cwd: tab.cwd,
      includePatches: true,
      path: selectedPath,
      scope: selectedScope,
    })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok || !res.content) {
          throw new Error(res.error?.message ?? "Failed to load patch");
        }
        const next = res.content as { files?: GitDiffFile[] };
        const file = next.files?.find((candidate) => candidate.path === selectedPath);
        if (file) {
          setPatchByPath((prev) => ({
            ...prev,
            [`${selectedScope}:${selectedPath}`]: file,
          }));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPatchError(err instanceof Error ? err.message : "Failed to load patch");
        }
      })
      .finally(() => {
        if (!cancelled) setPatchLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    call,
    tab.cwd,
    data.isRepo,
    selectedPath,
    selectedScope,
    selectedSummary,
    selectedPatch?.diff,
  ]);

  const runGitAction = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      setActionBusy(true);
      setActionError(null);
      try {
        const res = await call(name, { cwd: tab.cwd, ...args });
        if (!res.ok) throw new Error(res.error?.message ?? `Failed to run ${name}`);
        setPatchByPath({});
        await refresh(true);
        await refreshStatus();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setActionBusy(false);
      }
    },
    [call, refresh, refreshStatus, tab.cwd],
  );

  const selectFile = useCallback((path: string, scope: GitScope) => {
    setSelectedPath(path);
    setSelectedScope(scope);
  }, []);

  const suggestCommitMessage = useCallback(async () => {
    setSuggestBusy(true);
    setActionError(null);
    try {
      const scope = (status?.staged.length ?? 0) > 0 ? "staged" : "all";
      const res = await call("git_diff", {
        cwd: tab.cwd,
        includePatches: true,
        scope,
      });
      if (!res.ok || !res.content) {
        throw new Error(res.error?.message ?? "Failed to load full diff");
      }
      const fullDiff = res.content as { files?: GitDiffFile[] };
      const files = fullDiff.files ?? data.files;
      const fallback = suggestMessage(status, files);
      try {
        const completion = await bridge.ai.complete({
          cwd: tab.cwd,
          systemPrompt: COMMIT_MESSAGE_SYSTEM_PROMPT,
          prompt: buildCommitMessagePrompt(scope, files),
          maxChars: 160,
          timeoutMs: 45_000,
        });
        const suggestion =
          completion.adapterId === "mock"
            ? fallback
            : normalizeCommitSubject(completion.text);
        setCommitMessage(suggestion || fallback);
      } catch (err) {
        setCommitMessage(fallback);
        setActionError(
          `AI suggestion unavailable: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setSuggestBusy(false);
    }
  }, [bridge.ai, call, data.files, status, tab.cwd]);

  const commitChanges = useCallback(async () => {
    if (!commitMessage.trim()) return;
    await runGitAction("git_commit", { message: commitMessage.trim() });
    setCommitMessage("");
  }, [commitMessage, runGitAction]);

  const restoreFile = useCallback(
    async (path: string) => {
      if (confirmBeforeRestore) {
        const ok = window.confirm(`Discard changes in ${path}? This cannot be undone.`);
        if (!ok) return;
      }
      await runGitAction("git_restore", {
        paths: [path],
        target: selectedScope === "staged" ? "staged" : "worktree",
        confirm: true,
      });
    },
    [confirmBeforeRestore, runGitAction, selectedScope],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card/40 px-3 py-1.5">
        <span className="text-xs text-muted-foreground">
          {data.files.length} changed file{data.files.length === 1 ? "" : "s"}
        </span>
        {status?.branch && (
          <span className="max-w-48 truncate font-mono text-xs text-muted-foreground">
            {status.branch}
            {status.ahead > 0 ? ` +${status.ahead}` : ""}
            {status.behind > 0 ? ` -${status.behind}` : ""}
          </span>
        )}
        <span className="font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
          +{data.totalAdditions}
        </span>
        <span className="font-mono text-xs tabular-nums text-rose-600 dark:text-rose-400">
          -{data.totalDeletions}
        </span>
        <div className="flex-1" />
        <TooltipButton label="Refresh git status" side="bottom">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={clearAndRefresh}
            aria-label="Refresh git status"
            data-loading={loading}
          >
            <RefreshCwIcon
              className="size-4 data-[spin=true]:animate-spin"
              data-spin={loading}
              aria-hidden
            />
          </Button>
        </TooltipButton>
      </div>

      {error ? (
        <EmptyState message={error} />
      ) : !data.isRepo ? (
        <EmptyState message="This project is not a git repository." />
      ) : data.files.length === 0 ? (
        <EmptyState
          message={loading ? "Loading changes…" : "No changes — working tree is clean."}
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          <SourceControlSidebar
            stagedNodes={fileTree.staged}
            unstagedNodes={fileTree.unstaged}
            expandedDirs={expandedDirs}
            selectedPath={selectedPath}
            selectedScope={selectedScope}
            onToggleDir={toggleDir}
            onSelect={selectFile}
            width={sidebar.size}
            commitMessage={commitMessage}
            onCommitMessageChange={setCommitMessage}
            onSuggestCommitMessage={suggestCommitMessage}
            onCommit={commitChanges}
            activeIdentity={activeIdentity}
            canCommit={
              (status?.staged.length ?? 0) > 0 && commitMessage.trim().length > 0
            }
            busy={actionBusy}
            suggestBusy={suggestBusy}
          />
          {/* Resize handle */}
          <button
            type="button"
            aria-label="Resize changed files sidebar"
            onPointerDown={sidebar.onPointerDown}
            className="w-1 shrink-0 cursor-col-resize border-r border-border bg-transparent transition-colors hover:bg-primary/40 focus-visible:bg-primary/40 focus-visible:outline-none"
          />
          <div className="min-w-0 flex-1">
            {selectedFile && (
              <FileDiff
                file={selectedFile}
                scope={selectedScope}
                loading={patchLoading}
                error={patchError ?? actionError}
                busy={actionBusy}
                onStage={(path) => runGitAction("git_stage", { paths: [path] })}
                onUnstage={(path) => runGitAction("git_unstage", { paths: [path] })}
                onRestore={restoreFile}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SourceControlSidebar({
  stagedNodes,
  unstagedNodes,
  expandedDirs,
  selectedPath,
  selectedScope,
  onToggleDir,
  onSelect,
  width,
  commitMessage,
  onCommitMessageChange,
  onSuggestCommitMessage,
  onCommit,
  activeIdentity,
  canCommit,
  busy,
  suggestBusy,
}: {
  stagedNodes: DiffTreeNode[];
  unstagedNodes: DiffTreeNode[];
  expandedDirs: Set<string>;
  selectedPath: string | null;
  selectedScope: GitScope;
  onToggleDir: (path: string) => void;
  onSelect: (path: string, scope: GitScope) => void;
  width: number;
  commitMessage: string;
  onCommitMessageChange: (message: string) => void;
  onSuggestCommitMessage: () => void;
  onCommit: () => void;
  activeIdentity: GitSettings["identityProfiles"][number] | null;
  canCommit: boolean;
  busy: boolean;
  suggestBusy: boolean;
}) {
  return (
    <div
      className="flex min-h-0 shrink-0 flex-col border-r border-border bg-card/30"
      style={{ width }}
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col py-1">
          <SourceSection
            title="Staged"
            scope="staged"
            nodes={stagedNodes}
            expandedDirs={expandedDirs}
            selectedPath={selectedPath}
            selectedScope={selectedScope}
            onToggleDir={onToggleDir}
            onSelect={onSelect}
          />
          <SourceSection
            title="Changes"
            scope="unstaged"
            nodes={unstagedNodes}
            expandedDirs={expandedDirs}
            selectedPath={selectedPath}
            selectedScope={selectedScope}
            onToggleDir={onToggleDir}
            onSelect={onSelect}
          />
        </div>
      </ScrollArea>
      <div className="shrink-0 border-t border-border p-2">
        <textarea
          value={commitMessage}
          onChange={(event) => onCommitMessageChange(event.target.value)}
          placeholder="Commit message"
          className="min-h-16 w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="mt-1 truncate px-0.5 text-[11px] text-muted-foreground">
          {activeIdentity
            ? `Committing as ${activeIdentity.name || "unnamed user"}${
                activeIdentity.email ? ` <${activeIdentity.email}>` : ""
              }`
            : "Committing with repository Git config"}
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          <TooltipButton label="Suggest commit message" side="top">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={onSuggestCommitMessage}
              disabled={busy || suggestBusy}
              aria-label="Suggest commit message"
            >
              {suggestBusy ? (
                <RefreshCwIcon className="size-4 animate-spin" aria-hidden />
              ) : (
                <LightbulbIcon className="size-4" aria-hidden />
              )}
            </Button>
          </TooltipButton>
          <TooltipButton label="Commit staged changes" side="top">
            <Button
              type="button"
              size="sm"
              className="min-w-0 flex-1"
              onClick={onCommit}
              disabled={!canCommit || busy}
            >
              <GitCommitIcon className="size-4" aria-hidden />
              Commit
            </Button>
          </TooltipButton>
        </div>
      </div>
    </div>
  );
}

function SourceSection({
  title,
  scope,
  nodes,
  expandedDirs,
  selectedPath,
  selectedScope,
  onToggleDir,
  onSelect,
}: {
  title: string;
  scope: GitScope;
  nodes: DiffTreeNode[];
  expandedDirs: Set<string>;
  selectedPath: string | null;
  selectedScope: GitScope;
  onToggleDir: (path: string) => void;
  onSelect: (path: string, scope: GitScope) => void;
}) {
  return (
    <div className="pb-1">
      <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{title}</span>
        <span className="font-mono">{countFiles(nodes)}</span>
      </div>
      {nodes.length === 0 ? (
        <div className="px-2 py-1 text-xs text-muted-foreground/70">No files</div>
      ) : (
        nodes.map((node) => (
          <DiffTreeRow
            key={`${scope}:${node.path}`}
            node={node}
            depth={0}
            scope={scope}
            expandedDirs={expandedDirs}
            selectedPath={selectedPath}
            selectedScope={selectedScope}
            onToggleDir={onToggleDir}
            onSelect={onSelect}
          />
        ))
      )}
    </div>
  );
}

function DiffTreeRow({
  node,
  depth,
  scope,
  expandedDirs,
  selectedPath,
  selectedScope,
  onToggleDir,
  onSelect,
}: {
  node: DiffTreeNode;
  depth: number;
  scope: GitScope;
  expandedDirs: Set<string>;
  selectedPath: string | null;
  selectedScope: GitScope;
  onToggleDir: (path: string) => void;
  onSelect: (path: string, scope: GitScope) => void;
}) {
  const paddingLeft = 10 + depth * 14;

  if (node.type === "dir") {
    const expanded = expandedDirs.has(node.path);
    return (
      <div>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => onToggleDir(node.path)}
          title={node.path}
          className="flex w-full items-center gap-1.5 py-1 pr-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          style={{ paddingLeft }}
        >
          <ChevronRightIcon
            className={cn(
              "size-3 shrink-0 transition-transform",
              expanded && "rotate-90",
            )}
            aria-hidden
          />
          {expanded ? (
            <FolderOpenIcon className="size-3.5 shrink-0 opacity-80" aria-hidden />
          ) : (
            <FolderIcon className="size-3.5 shrink-0 opacity-80" aria-hidden />
          )}
          <span className="min-w-0 flex-1 truncate font-mono">{node.name}</span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
            {node.fileCount}
          </span>
          {(node.additions > 0 || node.deletions > 0) && (
            <DiffCounts additions={node.additions} deletions={node.deletions} />
          )}
        </button>
        {expanded &&
          node.children.map((child) => (
            <DiffTreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              scope={scope}
              expandedDirs={expandedDirs}
              selectedPath={selectedPath}
              selectedScope={selectedScope}
              onToggleDir={onToggleDir}
              onSelect={onSelect}
            />
          ))}
      </div>
    );
  }

  const { file } = node;
  const meta = STATUS_META[file.status] ?? STATUS_META.modified;
  const Icon = statusIcon(file.status);
  const active = file.path === selectedPath && scope === selectedScope;

  return (
    <button
      type="button"
      onClick={() => onSelect(file.path, scope)}
      aria-current={active}
      title={file.path}
      className={cn(
        "flex w-full items-center gap-2 py-1.5 pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        active ? "bg-accent" : "hover:bg-accent/50",
      )}
      style={{ paddingLeft }}
    >
      <Icon className={cn("size-4 shrink-0", meta.className)} aria-hidden />
      <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-foreground">
        {node.name}
      </span>
      {!file.binary && (
        <DiffCounts additions={file.additions} deletions={file.deletions} />
      )}
    </button>
  );
}

function DiffCounts({
  additions,
  deletions,
}: {
  additions: number;
  deletions: number;
}) {
  return (
    <span className="shrink-0 font-mono text-[10px] tabular-nums">
      <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>{" "}
      <span className="text-rose-600 dark:text-rose-400">-{deletions}</span>
    </span>
  );
}

function buildDiffTree(files: GitDiffFile[]): DiffTreeNode[] {
  const root: DiffTreeDir = {
    type: "dir",
    path: "",
    name: "",
    children: [],
    fileCount: 0,
    additions: 0,
    deletions: 0,
  };
  const dirs = new Map<string, DiffTreeDir>([["", root]]);

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let parent = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      parent.fileCount += 1;
      parent.additions += file.additions;
      parent.deletions += file.deletions;

      if (isLeaf) {
        parent.children.push({
          type: "file",
          path: file.path,
          name: part,
          file,
        });
        continue;
      }

      let dir = dirs.get(currentPath);
      if (!dir) {
        dir = {
          type: "dir",
          path: currentPath,
          name: part,
          children: [],
          fileCount: 0,
          additions: 0,
          deletions: 0,
        };
        dirs.set(currentPath, dir);
        parent.children.push(dir);
      }
      parent = dir;
    }
  }

  sortDiffTree(root.children);
  return root.children;
}

function filesForStatus(
  files: GitStatusFile[],
  summaryByPath: Map<string, GitDiffFile>,
  scope: GitScope,
): GitDiffFile[] {
  const seen = new Set<string>();
  return files
    .filter((file) => {
      if (seen.has(file.path)) return false;
      seen.add(file.path);
      return true;
    })
    .map((file) => {
      const summary = summaryByPath.get(file.path);
      return {
        path: file.path,
        status: file.status,
        additions: summary?.additions ?? 0,
        deletions: summary?.deletions ?? 0,
        binary: summary?.binary ?? false,
        diff: "",
      };
    })
    .filter(
      (file) => scope === "staged" || file.status !== "deleted" || file.deletions > 0,
    );
}

function countFiles(nodes: DiffTreeNode[]): number {
  return nodes.reduce((sum, node) => {
    if (node.type === "file") return sum + 1;
    return sum + node.fileCount;
  }, 0);
}

const COMMIT_MESSAGE_SYSTEM_PROMPT = [
  "You generate Conventional Commit subject lines from git diffs.",
  "Return exactly one subject line and no Markdown, commentary, bullets, or quotes.",
  "Keep it under 90 characters.",
  "Use a useful type such as feat, fix, docs, test, style, refactor, chore, or build.",
  "Describe the semantic intent of the diff, not just the filenames.",
].join("\n");

function buildCommitMessagePrompt(scope: "all" | GitScope, files: GitDiffFile[]): string {
  const changedFiles = files
    .map(
      (file) =>
        `- ${file.status} ${file.path} (+${file.additions} -${file.deletions})${
          file.binary ? " [binary]" : ""
        }`,
    )
    .join("\n");
  return [
    `Generate a meaningful Conventional Commit subject for the ${scope} diff below.`,
    "",
    "Changed files:",
    changedFiles || "- none",
    "",
    "Full diff:",
    "```diff",
    renderFullDiffForPrompt(files),
    "```",
  ].join("\n");
}

function renderFullDiffForPrompt(files: GitDiffFile[]): string {
  return files
    .map((file) => {
      if (file.diff.trim()) return file.diff.trim();
      return [
        `diff --git a/${file.path} b/${file.path}`,
        `# status: ${file.status}`,
        `# additions: ${file.additions}`,
        `# deletions: ${file.deletions}`,
        file.binary ? "# binary file" : "# patch unavailable",
      ].join("\n");
    })
    .join("\n\n");
}

function normalizeCommitSubject(text: string): string {
  const line = text
    .replace(/```[\s\S]*?```/g, (block) =>
      block
        .replace(/^```[a-z]*\s*/i, "")
        .replace(/```$/i, "")
        .trim(),
    )
    .split(/\r?\n/)
    .map((item) =>
      item
        .trim()
        .replace(/^[-*]\s+/, "")
        .replace(/^["'`]+|["'`]+$/g, "")
        .replace(/^commit message:\s*/i, ""),
    )
    .find(Boolean);
  return (line ?? "").slice(0, 90);
}

function suggestMessage(status: GitStatusResult | null, files: GitDiffFile[]): string {
  const staged = status?.staged ?? [];
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const source =
    staged.length > 0 ? staged.map((file) => filesByPath.get(file.path) ?? file) : files;
  if (source.length === 0) return "";
  const fullDiff = files
    .map((file) => file.diff)
    .filter(Boolean)
    .join("\n\n");
  const firstPath = source[0].path;
  const area = firstPath.includes("/") ? firstPath.split("/")[0] : basename(firstPath);
  const type = inferCommitType(source, fullDiff);
  if (source.length === 1) return `${type}: update ${basename(firstPath)}`;
  return `${type}: update ${area} source control changes`;
}

function inferCommitType(
  files: Array<Pick<GitDiffFile, "path" | "status">>,
  fullDiff: string,
): "feat" | "fix" | "docs" | "test" | "style" | "chore" {
  const paths = files.map((file) => file.path);
  if (paths.length > 0 && paths.every(isDocsPath)) return "docs";
  if (paths.length > 0 && paths.every(isTestPath)) return "test";
  if (paths.length > 0 && paths.every(isStylePath)) return "style";
  if (paths.some(isDependencyPath)) return "chore";
  const added = files.some(
    (file) => file.status === "added" || file.status === "untracked",
  );
  if (
    added ||
    /^\+(?!\+\+).*(export\s+)?(class|function|interface|type|const)\s+/m.test(fullDiff)
  ) {
    return "feat";
  }
  if (files.some((file) => file.status === "deleted")) return "chore";
  return "fix";
}

function isDocsPath(path: string): boolean {
  return (
    path.startsWith("docs/") ||
    path === "README.md" ||
    path.endsWith(".md") ||
    path.endsWith(".mdx")
  );
}

function isTestPath(path: string): boolean {
  return (
    path.includes("__tests__/") ||
    path.endsWith(".test.ts") ||
    path.endsWith(".test.tsx") ||
    path.endsWith(".spec.ts") ||
    path.endsWith(".spec.tsx")
  );
}

function isStylePath(path: string): boolean {
  return path.endsWith(".css") || path.endsWith(".scss") || path.endsWith(".sass");
}

function isDependencyPath(path: string): boolean {
  return (
    path === "package.json" ||
    path.endsWith("/package.json") ||
    path.endsWith("-lock.json") ||
    path.endsWith("pnpm-lock.yaml") ||
    path.endsWith("yarn.lock")
  );
}

function sortDiffTree(nodes: DiffTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.type === "dir") sortDiffTree(node.children);
  }
}

function collectDirPaths(nodes: DiffTreeNode[]): Set<string> {
  const paths = new Set<string>();
  const visit = (node: DiffTreeNode) => {
    if (node.type !== "dir") return;
    paths.add(node.path);
    for (const child of node.children) visit(child);
  };
  for (const node of nodes) visit(node);
  return paths;
}

function parentDirs(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  const dirs: string[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    dirs.push(parts.slice(0, i).join("/"));
  }
  return dirs;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function TooltipButton({
  label,
  side = "top",
  children,
}: {
  label: string;
  side?: TooltipSide;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  added: { label: "Added", className: "text-emerald-600 dark:text-emerald-400" },
  untracked: { label: "Untracked", className: "text-emerald-600 dark:text-emerald-400" },
  deleted: { label: "Deleted", className: "text-rose-600 dark:text-rose-400" },
  renamed: { label: "Renamed", className: "text-amber-600 dark:text-amber-400" },
  copied: { label: "Copied", className: "text-amber-600 dark:text-amber-400" },
  modified: { label: "Modified", className: "text-muted-foreground" },
};

function statusIcon(status: string) {
  if (status === "added" || status === "untracked") return FilePlusIcon;
  if (status === "deleted") return FileXIcon;
  return FileDiffIcon;
}

function FileDiff({
  file,
  scope,
  loading,
  error,
  busy,
  onStage,
  onUnstage,
  onRestore,
}: {
  file: GitDiffFile;
  scope: GitScope;
  loading: boolean;
  error: string | null;
  busy: boolean;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onRestore: (path: string) => void;
}) {
  const meta = STATUS_META[file.status] ?? STATUS_META.modified;
  const Icon = statusIcon(file.status);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card/40 px-3 py-2">
        <Icon className={`size-4 shrink-0 ${meta.className}`} aria-hidden />
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={file.path}>
          <span className="text-muted-foreground">{dirOf(file.path)}</span>
          <span className="font-medium text-foreground">{basename(file.path)}</span>
        </span>
        <span
          className={`shrink-0 text-[10px] uppercase tracking-wide ${meta.className}`}
        >
          {meta.label}
        </span>
        {!file.binary && (
          <span className="shrink-0 font-mono text-[11px] tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400">
              +{file.additions}
            </span>{" "}
            <span className="text-rose-600 dark:text-rose-400">-{file.deletions}</span>
          </span>
        )}
        <div className="flex shrink-0 items-center gap-1">
          {scope === "unstaged" ? (
            <TooltipButton label="Stage file" side="bottom">
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => onStage(file.path)}
                disabled={busy}
                aria-label="Stage file"
              >
                <CheckIcon className="size-3.5" aria-hidden />
              </Button>
            </TooltipButton>
          ) : (
            <TooltipButton label="Unstage file" side="bottom">
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                onClick={() => onUnstage(file.path)}
                disabled={busy}
                aria-label="Unstage file"
              >
                <RotateCcwIcon className="size-3.5" aria-hidden />
              </Button>
            </TooltipButton>
          )}
          <TooltipButton label="Restore file" side="bottom">
            <Button
              type="button"
              size="icon-xs"
              variant="destructive"
              onClick={() => onRestore(file.path)}
              disabled={busy}
              aria-label="Restore file"
            >
              <FileXIcon className="size-3.5" aria-hidden />
            </Button>
          </TooltipButton>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {file.binary ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Binary file not shown.
          </div>
        ) : loading ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">Loading patch…</div>
        ) : error ? (
          <div className="px-3 py-2 text-xs text-destructive">{error}</div>
        ) : file.diff ? (
          <DiffBody diff={file.diff} />
        ) : (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No patch available.
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface DiffRow {
  key: string;
  type: "hunk" | "add" | "del" | "context";
  left: string;
  right: string;
  text: string;
}

/** File-level header lines that carry no per-line content worth rendering. */
function isHeaderLine(line: string): boolean {
  return (
    line.startsWith("diff --git ") ||
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("new file") ||
    line.startsWith("deleted file") ||
    line.startsWith("similarity ") ||
    line.startsWith("rename ") ||
    line.startsWith("old mode") ||
    line.startsWith("new mode")
  );
}

/** Parse a unified patch into renderable rows with running line numbers. */
function buildRows(diff: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldNo = 0;
  let newNo = 0;
  const lines = diff.replace(/\n$/, "").split("\n");

  lines.forEach((line, i) => {
    if (isHeaderLine(line)) return;

    if (line.startsWith("@@")) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldNo = Number.parseInt(m[1], 10);
        newNo = Number.parseInt(m[2], 10);
      }
      rows.push({ key: `${i}:${line}`, type: "hunk", left: "", right: "", text: line });
      return;
    }

    const isAdd = line[0] === "+";
    const isDel = line[0] === "-";
    const left = isAdd ? "" : String(oldNo);
    const right = isDel ? "" : String(newNo);
    if (!isAdd) oldNo += 1;
    if (!isDel) newNo += 1;

    rows.push({
      key: `${i}:${line}`,
      type: isAdd ? "add" : isDel ? "del" : "context",
      left,
      right,
      text: line,
    });
  });

  return rows;
}

/** Render a unified patch as colored, line-numbered rows. */
function DiffBody({ diff }: { diff: string }) {
  const rows = useMemo(() => buildRows(diff), [diff]);

  return (
    <div className="overflow-x-auto bg-background">
      <table className="w-full border-collapse font-mono text-xs leading-5">
        <tbody>
          {rows.map((row) => {
            if (row.type === "hunk") {
              return (
                <tr key={row.key} className="bg-muted/60 text-muted-foreground">
                  <td className="w-10 select-none border-r border-border" />
                  <td className="w-10 select-none border-r border-border" />
                  <td className="whitespace-pre-wrap px-2 py-0.5">{row.text}</td>
                </tr>
              );
            }

            const rowClass =
              row.type === "add"
                ? "bg-emerald-500/10"
                : row.type === "del"
                  ? "bg-rose-500/10"
                  : "";
            const textClass =
              row.type === "add"
                ? "text-emerald-700 dark:text-emerald-300"
                : row.type === "del"
                  ? "text-rose-700 dark:text-rose-300"
                  : "text-foreground";

            return (
              <tr key={row.key} className={rowClass}>
                <td className="w-10 select-none border-r border-border px-2 py-0.5 text-right text-muted-foreground/60">
                  {row.left}
                </td>
                <td className="w-10 select-none border-r border-border px-2 py-0.5 text-right text-muted-foreground/60">
                  {row.right}
                </td>
                <td className={`whitespace-pre-wrap px-2 py-0.5 ${textClass}`}>
                  {row.text || " "}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The directory portion of a path (with trailing slash), or "" at the root. */
function dirOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx + 1);
}
