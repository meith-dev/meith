import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type GitDiffFile, useGitDiff } from "@/hooks/useGitDiff";
import { basename } from "@/lib/workspace";
import type { ToolResult, WorkspaceTab } from "@meith/shared";
import { FileDiffIcon, FilePlusIcon, FileXIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useState } from "react";

interface DiffViewProps {
  tab: WorkspaceTab;
  call: (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;
  /** Bumped when workspace files change, to refetch the diff. */
  refreshKey: number;
}

/**
 * The diff surface: lists every changed file (vs HEAD, including untracked)
 * with its unified patch rendered as colored add/remove lines. Self-contained
 * — it fetches via the `git_diff` tool and refreshes on file changes.
 */
export function DiffView({ tab, call, refreshKey }: DiffViewProps) {
  const { data, loading, error, refresh } = useGitDiff(call, tab.cwd, { refreshKey });
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

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

  const selectedFile = data.files.find((f) => f.path === selectedPath) ?? null;

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
          onClick={() => void refresh()}
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
          <FileList
            files={data.files}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
          />
          <div className="min-w-0 flex-1">
            {selectedFile && <FileDiff file={selectedFile} />}
          </div>
        </div>
      )}
    </div>
  );
}

/** Left sidebar: every changed file with its status and +/- counts. */
function FileList({
  files,
  selectedPath,
  onSelect,
}: {
  files: GitDiffFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <ScrollArea className="w-64 shrink-0 border-r border-border bg-card/30">
      <ul className="flex flex-col py-1">
        {files.map((file) => {
          const meta = STATUS_META[file.status] ?? STATUS_META.modified;
          const Icon = statusIcon(file.status);
          const active = file.path === selectedPath;
          return (
            <li key={file.path}>
              <button
                type="button"
                onClick={() => onSelect(file.path)}
                aria-current={active}
                title={file.path}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                  active ? "bg-accent" : "hover:bg-accent/50"
                }`}
              >
                <Icon className={`size-4 shrink-0 ${meta.className}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  <span className="text-muted-foreground">{dirOf(file.path)}</span>
                  <span className="font-medium text-foreground">
                    {basename(file.path)}
                  </span>
                </span>
                {!file.binary && (
                  <span className="shrink-0 font-mono text-[10px] tabular-nums">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      +{file.additions}
                    </span>{" "}
                    <span className="text-rose-600 dark:text-rose-400">
                      -{file.deletions}
                    </span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
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

function FileDiff({ file }: { file: GitDiffFile }) {
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
        ) : (
          <DiffBody diff={file.diff} />
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
  const rows = buildRows(diff);

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
