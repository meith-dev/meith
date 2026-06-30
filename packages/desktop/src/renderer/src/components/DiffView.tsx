import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type GitDiffFile, useGitDiff } from "@/hooks/useGitDiff";
import { useResizable } from "@/hooks/useResizable";
import { cn } from "@/lib/utils";
import { basename } from "@/lib/workspace";
import type { ToolResult, WorkspaceTab } from "@meith/shared";
import {
  ChevronRightIcon,
  FileDiffIcon,
  FilePlusIcon,
  FileXIcon,
  FolderIcon,
  FolderOpenIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface DiffViewProps {
  tab: WorkspaceTab;
  call: (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;
  /** Bumped when workspace files change, to refetch the diff. */
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

/**
 * The diff surface: lists every changed file (vs HEAD, including untracked)
 * with its unified patch rendered as colored add/remove lines. Self-contained
 * — it fetches via the `git_diff` tool and refreshes on file changes.
 */
export function DiffView({ tab, call, refreshKey }: DiffViewProps) {
  const { data, loading, error, refresh } = useGitDiff(call, tab.cwd, {
    refreshKey,
    pollMs: 2500,
    forcePoll: true,
    includePatches: false,
  });
  const [selectedPath, setSelectedPath] = useState<string | null>(
    tab.selectedDiffFilePath ?? null,
  );
  const [patchByPath, setPatchByPath] = useState<Record<string, GitDiffFile>>({});
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchError, setPatchError] = useState<string | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());
  const sidebar = useResizable({
    initial: 256,
    min: 180,
    max: 480,
    axis: "x",
    storageKey: "meith.diffSidebarWidth",
  });

  const fileTree = useMemo(() => buildDiffTree(data.files), [data.files]);
  const clearAndRefresh = useCallback(() => {
    setPatchByPath({});
    setPatchError(null);
    void refresh(true);
  }, [refresh]);
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
  // file, and recover if the selected file disappears from the diff.
  useEffect(() => {
    if (data.files.length === 0) {
      if (selectedPath !== null) setSelectedPath(null);
      return;
    }
    if (!selectedPath || !data.files.some((f) => f.path === selectedPath)) {
      setSelectedPath(data.files[0].path);
    }
  }, [data.files, selectedPath]);

  useEffect(() => {
    const persistedPath = tab.selectedDiffFilePath ?? null;
    if (selectedPath === persistedPath) return;
    void call("set_workspace_tab_file", {
      tabId: tab.id,
      selectedDiffFilePath: selectedPath,
    });
  }, [call, selectedPath, tab.id, tab.selectedDiffFilePath]);

  // Keep selected files visible in the tree, and drop expansion entries for
  // directories that no longer exist after a diff refresh.
  useEffect(() => {
    const validDirs = collectDirPaths(fileTree);
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

  const selectedSummary = data.files.find((f) => f.path === selectedPath) ?? null;
  const selectedPatch = selectedPath ? patchByPath[selectedPath] : undefined;
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
    })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok || !res.content) {
          throw new Error(res.error?.message ?? "Failed to load patch");
        }
        const next = res.content as { files?: GitDiffFile[] };
        const file = next.files?.find((candidate) => candidate.path === selectedPath);
        if (file) {
          setPatchByPath((prev) => ({ ...prev, [selectedPath]: file }));
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
  }, [call, tab.cwd, data.isRepo, selectedPath, selectedSummary, selectedPatch?.diff]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card/40 px-3 py-1.5">
        <span className="text-xs text-muted-foreground">
          {data.files.length} changed file{data.files.length === 1 ? "" : "s"}
        </span>
        <span className="font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
          +{data.totalAdditions}
        </span>
        <span className="font-mono text-xs tabular-nums text-rose-600 dark:text-rose-400">
          -{data.totalDeletions}
        </span>
        <div className="flex-1" />
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={clearAndRefresh}
          aria-label="Refresh diff"
          data-loading={loading}
        >
          <RefreshCwIcon
            className="size-4 data-[spin=true]:animate-spin"
            data-spin={loading}
            aria-hidden
          />
        </Button>
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
          <FileTree
            nodes={fileTree}
            expandedDirs={expandedDirs}
            selectedPath={selectedPath}
            onToggleDir={toggleDir}
            onSelect={setSelectedPath}
            width={sidebar.size}
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
              <FileDiff file={selectedFile} loading={patchLoading} error={patchError} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Left sidebar: changed files grouped by folder. */
function FileTree({
  nodes,
  expandedDirs,
  selectedPath,
  onToggleDir,
  onSelect,
  width,
}: {
  nodes: DiffTreeNode[];
  expandedDirs: Set<string>;
  selectedPath: string | null;
  onToggleDir: (path: string) => void;
  onSelect: (path: string) => void;
  width: number;
}) {
  return (
    <ScrollArea className="shrink-0 bg-card/30" style={{ width }}>
      <div className="flex flex-col py-1">
        {nodes.map((node) => (
          <DiffTreeRow
            key={node.path}
            node={node}
            depth={0}
            expandedDirs={expandedDirs}
            selectedPath={selectedPath}
            onToggleDir={onToggleDir}
            onSelect={onSelect}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

function DiffTreeRow({
  node,
  depth,
  expandedDirs,
  selectedPath,
  onToggleDir,
  onSelect,
}: {
  node: DiffTreeNode;
  depth: number;
  expandedDirs: Set<string>;
  selectedPath: string | null;
  onToggleDir: (path: string) => void;
  onSelect: (path: string) => void;
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
              expandedDirs={expandedDirs}
              selectedPath={selectedPath}
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
  const active = file.path === selectedPath;

  return (
    <button
      type="button"
      onClick={() => onSelect(file.path)}
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
  loading,
  error,
}: {
  file: GitDiffFile;
  loading: boolean;
  error: string | null;
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
