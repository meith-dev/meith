import { ensureMeithTheme, monaco } from "@/lib/monaco";
import { cn } from "@/lib/utils";
import { basename } from "@/lib/workspace";
import type { ToolResult, WorkspaceFileEvent, WorkspaceTab } from "@meith/shared";
import Editor, { type OnMount } from "@monaco-editor/react";
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  RotateCcwIcon,
  SaveIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface EditorViewProps {
  tab: WorkspaceTab;
  call: (name: string, args?: Record<string, unknown>) => Promise<ToolResult>;
  fileEvents: WorkspaceFileEvent[];
}

interface FileEntry {
  path: string;
  name: string;
  type: "file" | "dir";
}

interface FileTreeNode {
  path: string;
  name: string;
  type: "file" | "dir";
  children: FileTreeNode[];
}

interface DiagnosticItem {
  message: string;
  severity: "error" | "warning" | "info";
  /** 1-based line. */
  line: number;
  /** 1-based column. */
  column: number;
  code?: number;
}

interface OpenFile {
  path: string;
  /** Content as last loaded/saved on disk. */
  savedContent: string;
  /** Current editor buffer content. */
  content: string;
  /** Content before the most recent external (agent/tool) edit, for undo. */
  undoContent: string | null;
}

/** Map a file extension to a Monaco language id. */
function languageForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "mjs":
    case "cjs":
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "css":
      return "css";
    case "scss":
      return "scss";
    case "less":
      return "less";
    case "html":
      return "html";
    case "md":
    case "markdown":
      return "markdown";
    case "yml":
    case "yaml":
      return "yaml";
    case "py":
      return "python";
    case "rs":
      return "rust";
    case "go":
      return "go";
    case "sh":
    case "bash":
      return "shell";
    default:
      return "plaintext";
  }
}

const SEVERITY_TO_MARKER: Record<DiagnosticItem["severity"], number> = {
  error: 8, // monaco.MarkerSeverity.Error
  warning: 4, // monaco.MarkerSeverity.Warning
  info: 2, // monaco.MarkerSeverity.Info
};
const TREE_PAGE_SIZE = 20000;

function buildFileTree(entries: FileEntry[]): FileTreeNode[] {
  const root: FileTreeNode = { path: "", name: "", type: "dir", children: [] };
  const byPath = new Map<string, FileTreeNode>([["", root]]);

  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let parent = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLeaf = i === parts.length - 1;
      const type = isLeaf ? entry.type : "dir";
      let node = byPath.get(currentPath);

      if (!node) {
        node = { path: currentPath, name: part, type, children: [] };
        byPath.set(currentPath, node);
        parent.children.push(node);
      } else if (isLeaf) {
        node.type = entry.type;
      }

      parent = node;
    }
  }

  sortTree(root.children);
  return root.children;
}

function sortTree(nodes: FileTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) sortTree(node.children);
}

function parentDirs(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  const parents: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    parents.push(parts.slice(0, i).join("/"));
  }
  return parents;
}

function parentPath(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(0, idx) : "";
}

function isDirectChild(path: string, parent: string): boolean {
  return parentPath(path) === parent;
}

function mergeDirectoryEntries(
  current: FileEntry[],
  dirPath: string,
  entries: FileEntry[],
): FileEntry[] {
  const byPath = new Map<string, FileEntry>();
  for (const entry of current) {
    if (!isDirectChild(entry.path, dirPath)) byPath.set(entry.path, entry);
  }
  for (const entry of entries) byPath.set(entry.path, entry);
  return [...byPath.values()];
}

/**
 * Monaco-backed code editor bound to a project workspace. File I/O, search and
 * diagnostics all flow through the validated `workspace_*` tools in the main
 * process — the editor never touches the filesystem directly. Edits applied by
 * tools/agents surface as an inline diff with a one-click undo.
 */
export function EditorView({ tab, call, fileEvents }: EditorViewProps) {
  const cwd = tab.cwd;
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());
  const [loadedDirs, setLoadedDirs] = useState<Set<string>>(() => new Set());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(() => new Set());
  const [truncatedDirs, setTruncatedDirs] = useState<Set<string>>(() => new Set());
  const [dirErrors, setDirErrors] = useState<Map<string, string>>(() => new Map());
  const [open, setOpen] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(tab.activeFilePath ?? null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const diffDecorationsRef = useRef<string[]>([]);
  const seenFileEventsRef = useRef<Set<string>>(
    new Set(fileEvents.map((event) => event.id)),
  );
  const loadedDirsRef = useRef(loadedDirs);

  useEffect(() => {
    loadedDirsRef.current = loadedDirs;
  }, [loadedDirs]);

  useEffect(() => {
    const unseen = fileEvents.filter((event) => !seenFileEventsRef.current.has(event.id));
    if (unseen.length === 0) return;
    for (const event of unseen) seenFileEventsRef.current.add(event.id);

    const relevant = unseen.filter((event) => event.cwd === cwd);
    if (relevant.length === 0) return;

    setOpen((prev) => {
      let next = prev;
      for (const event of relevant) {
        const idx = next.findIndex((file) => file.path === event.path);
        if (idx < 0) continue;
        const file = next[idx];
        const dirtyFile = file.content !== file.savedContent;

        if (event.after === null) {
          if (dirtyFile) {
            setLoadError(
              `External edit deleted ${event.path}; local unsaved edits are still open.`,
            );
            continue;
          }
          next = next.filter((candidate) => candidate.path !== event.path);
          setActivePath((current) => (current === event.path ? null : current));
          continue;
        }

        if (file.content === event.after) {
          next = next.map((candidate) =>
            candidate.path === event.path
              ? { ...candidate, savedContent: event.after ?? "", undoContent: null }
              : candidate,
          );
          continue;
        }

        if (dirtyFile) {
          setLoadError(
            `External edit changed ${event.path}; local unsaved edits were kept.`,
          );
          continue;
        }

        next = next.map((candidate) =>
          candidate.path === event.path
            ? {
                ...candidate,
                content: event.after ?? "",
                savedContent: event.after ?? "",
                undoContent: event.before,
              }
            : candidate,
        );
      }
      return next;
    });
  }, [fileEvents, cwd]);

  const activeFile = useMemo(
    () => open.find((f) => f.path === activePath) ?? null,
    [open, activePath],
  );
  const dirty = activeFile ? activeFile.content !== activeFile.savedContent : false;
  const hasUndo = activeFile ? activeFile.undoContent !== null : false;
  const fileTree = useMemo(() => buildFileTree(tree), [tree]);

  // --- Load the file tree for this workspace -------------------------------
  const loadDir = useCallback(
    async (path = "", force = false) => {
      if (!force && loadedDirsRef.current.has(path)) return;
      setLoadingDirs((prev) => new Set(prev).add(path));
      setDirErrors((prev) => {
        const next = new Map(prev);
        next.delete(path);
        return next;
      });
      const res = await call("workspace_list_files", {
        cwd,
        path: path || undefined,
        recursive: false,
        maxEntries: TREE_PAGE_SIZE,
      });
      setLoadingDirs((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      if (!res.ok) {
        const message = res.error?.message ?? `Failed to list ${path || basename(cwd)}`;
        setDirErrors((prev) => new Map(prev).set(path, message));
        if (!path) setLoadError(message);
        return;
      }
      const content = res.content as { entries?: FileEntry[]; truncated?: boolean };
      setTree((prev) => mergeDirectoryEntries(prev, path, content.entries ?? []));
      setLoadedDirs((prev) => {
        const next = new Set(prev).add(path);
        loadedDirsRef.current = next;
        return next;
      });
      setTruncatedDirs((prev) => {
        const next = new Set(prev);
        if (content.truncated) next.add(path);
        else next.delete(path);
        return next;
      });
    },
    [call, cwd],
  );

  const refreshTree = useCallback(async () => {
    const res = await call("workspace_list_files", {
      cwd,
      recursive: false,
      maxEntries: TREE_PAGE_SIZE,
    });
    if (res.ok) {
      const content = res.content as { entries?: FileEntry[]; truncated?: boolean };
      setTree(content.entries ?? []);
      const loaded = new Set([""]);
      setLoadedDirs(loaded);
      loadedDirsRef.current = loaded;
      setTruncatedDirs(content.truncated ? new Set([""]) : new Set());
      setDirErrors(new Map());
    } else {
      setLoadError(res.error?.message ?? "Failed to list files");
    }
  }, [call, cwd]);

  useEffect(() => {
    void refreshTree();
  }, [refreshTree]);

  useEffect(() => {
    if (!activePath) return;
    const parents = parentDirs(activePath);
    if (parents.length === 0) return;
    setExpandedDirs((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const dir of parents) {
        if (!next.has(dir)) {
          next.add(dir);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    void (async () => {
      for (const dir of parents) await loadDir(dir);
    })();
  }, [activePath, loadDir]);

  // --- Open a file into a buffer (or focus it if already open) -------------
  const openFile = useCallback(
    async (path: string) => {
      setActivePath(path);
      if (open.some((f) => f.path === path)) return;
      const res = await call("workspace_read_file", { cwd, path });
      if (!res.ok) {
        setLoadError(res.error?.message ?? `Failed to open ${path}`);
        return;
      }
      const content = (res.content as { content?: string }).content ?? "";
      setOpen((prev) =>
        prev.some((f) => f.path === path)
          ? prev
          : [...prev, { path, savedContent: content, content, undoContent: null }],
      );
    },
    [call, cwd, open],
  );

  const toggleDir = useCallback(
    (path: string) => {
      const isExpanded = expandedDirs.has(path);
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      if (!isExpanded) void loadDir(path, true);
    },
    [expandedDirs, loadDir],
  );

  // Persist the open/active file set onto the workspace tab so it survives
  // re-renders and is visible to CLI/agents through app state.
  useEffect(() => {
    void call("set_workspace_tab_file", {
      tabId: tab.id,
      activeFilePath: activePath,
      openFilePaths: open.map((f) => f.path),
    });
  }, [call, tab.id, activePath, open]);

  // Restore previously-open files after a remount (runs once on mount).
  const didRestore = useRef(false);
  useEffect(() => {
    if (didRestore.current) return;
    didRestore.current = true;
    const restore = tab.openFilePaths ?? [];
    if (restore.length === 0) return;
    void (async () => {
      for (const path of restore) {
        const res = await call("workspace_read_file", { cwd, path });
        if (!res.ok) continue;
        const content = (res.content as { content?: string }).content ?? "";
        setOpen((prev) =>
          prev.some((f) => f.path === path)
            ? prev
            : [...prev, { path, savedContent: content, content, undoContent: null }],
        );
      }
      if (tab.activeFilePath) setActivePath(tab.activeFilePath);
    })();
  }, [call, cwd, tab.openFilePaths, tab.activeFilePath]);

  // --- Diagnostics for the active file -------------------------------------
  const refreshDiagnostics = useCallback(
    async (path: string) => {
      const res = await call("get_diagnostics", { cwd, path });
      if (!res.ok) {
        setDiagnostics([]);
        return;
      }
      const content = res.content as {
        unsupported?: boolean;
        diagnostics?: DiagnosticItem[];
      };
      setDiagnostics(content.unsupported ? [] : (content.diagnostics ?? []));
    },
    [call, cwd],
  );

  useEffect(() => {
    if (!activePath) {
      setDiagnostics([]);
      return;
    }
    void refreshDiagnostics(activePath);
  }, [activePath, refreshDiagnostics, activeFile?.savedContent]);

  // Push diagnostics into Monaco as markers on the active model.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      "meith-diagnostics",
      diagnostics.map((d) => ({
        message: d.message,
        severity: SEVERITY_TO_MARKER[d.severity],
        startLineNumber: d.line,
        startColumn: d.column,
        // The service reports a point; extend the marker to the line end so it
        // is visibly underlined in the editor.
        endLineNumber: d.line,
        endColumn: d.column + 1,
        code: d.code !== undefined ? String(d.code) : undefined,
      })),
    );
  }, [diagnostics]);

  // --- Save the active buffer ----------------------------------------------
  const save = useCallback(async () => {
    if (!activeFile || !dirty) return;
    const res = await call("workspace_write_file", {
      cwd,
      path: activeFile.path,
      content: activeFile.content,
    });
    if (!res.ok) {
      setLoadError(res.error?.message ?? "Failed to save");
      return;
    }
    setOpen((prev) =>
      prev.map((f) =>
        f.path === activeFile.path
          ? { ...f, savedContent: f.content, undoContent: null }
          : f,
      ),
    );
    void loadDir(parentPath(activeFile.path), true);
  }, [activeFile, dirty, call, cwd, loadDir]);

  // Cmd/Ctrl+S to save.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // --- Inline diff highlight for externally-applied edits ------------------
  // When the prior content of the active file is captured (e.g. an agent
  // applied a patch), compute changed line ranges and decorate them.
  const renderDiffDecorations = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model || !activeFile || activeFile.undoContent === null) {
      diffDecorationsRef.current = editor.deltaDecorations(
        diffDecorationsRef.current,
        [],
      );
      return;
    }
    const before = activeFile.undoContent.split("\n");
    const after = activeFile.content.split("\n");
    const decorations: monaco.editor.IModelDeltaDecoration[] = [];
    const max = Math.max(before.length, after.length);
    for (let i = 0; i < max; i++) {
      if (before[i] !== after[i] && i < after.length) {
        decorations.push({
          range: new monaco.Range(i + 1, 1, i + 1, 1),
          options: {
            isWholeLine: true,
            className: "meith-diff-line",
            linesDecorationsClassName: "meith-diff-gutter",
          },
        });
      }
    }
    diffDecorationsRef.current = editor.deltaDecorations(
      diffDecorationsRef.current,
      decorations,
    );
  }, [activeFile]);

  useEffect(() => {
    renderDiffDecorations();
  }, [renderDiffDecorations]);

  // Undo the most recent external edit, restoring the prior content on disk.
  const undoExternalEdit = useCallback(async () => {
    if (!activeFile || activeFile.undoContent === null) return;
    const previous = activeFile.undoContent;
    const res = await call("workspace_write_file", {
      cwd,
      path: activeFile.path,
      content: previous,
    });
    if (!res.ok) {
      setLoadError(res.error?.message ?? "Failed to undo");
      return;
    }
    setOpen((prev) =>
      prev.map((f) =>
        f.path === activeFile.path
          ? { ...f, content: previous, savedContent: previous, undoContent: null }
          : f,
      ),
    );
  }, [activeFile, call, cwd]);

  const onMount: OnMount = useCallback((editor) => {
    ensureMeithTheme();
    editorRef.current = editor;
  }, []);

  const closeFile = useCallback(
    (path: string) => {
      setOpen((prev) => {
        const next = prev.filter((f) => f.path !== path);
        if (path === activePath) {
          setActivePath(next.length ? next[next.length - 1].path : null);
        }
        return next;
      });
    },
    [activePath],
  );

  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warnCount = diagnostics.filter((d) => d.severity === "warning").length;

  return (
    <div className="flex h-full min-h-0 bg-[#1a1714] text-foreground">
      {/* File tree */}
      <aside className="flex w-56 min-w-44 shrink-0 flex-col border-r border-border/60">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
          <span className="truncate text-xs font-medium text-muted-foreground">
            {basename(cwd)}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto py-1">
          {fileTree.map((node) => (
            <FileTreeRow
              key={node.path}
              node={node}
              depth={0}
              activePath={activePath}
              expandedDirs={expandedDirs}
              loadedDirs={loadedDirs}
              loadingDirs={loadingDirs}
              truncatedDirs={truncatedDirs}
              dirErrors={dirErrors}
              onToggleDir={toggleDir}
              onReloadDir={(path) => void loadDir(path, true)}
              onOpenFile={openFile}
            />
          ))}
          {tree.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground/70">
              {loadError ?? "No files"}
            </p>
          )}
        </div>
      </aside>

      {/* Editor column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Open file tabs */}
        <div className="flex items-center border-b border-border/60">
          <div className="flex min-w-0 flex-1 overflow-x-auto">
            {open.map((f) => (
              <div
                key={f.path}
                className={cn(
                  "group flex items-center gap-1.5 border-r border-border/60 px-3 py-1.5 text-xs",
                  f.path === activePath
                    ? "bg-[#1a1714] text-foreground"
                    : "bg-background/40 text-muted-foreground",
                )}
              >
                <button
                  type="button"
                  className="max-w-[160px] truncate"
                  onClick={() => setActivePath(f.path)}
                  title={f.path}
                >
                  {basename(f.path)}
                  {f.content !== f.savedContent ? " •" : ""}
                </button>
                <button
                  type="button"
                  aria-label={`Close ${f.path}`}
                  className="rounded opacity-0 hover:bg-muted group-hover:opacity-60"
                  onClick={() => closeFile(f.path)}
                >
                  <span className="px-1 text-sm leading-none">×</span>
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1 px-2">
            {hasUndo && (
              <button
                type="button"
                onClick={() => void undoExternalEdit()}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-yellow-500 hover:bg-muted/50"
                title="Undo the last edit applied by a tool/agent"
              >
                <RotateCcwIcon className="size-3.5" />
                Undo edit
              </button>
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty}
              className={cn(
                "flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-muted/50",
                dirty ? "text-foreground" : "text-muted-foreground/50",
              )}
              title="Save (Cmd/Ctrl+S)"
            >
              <SaveIcon className="size-3.5" />
              Save
            </button>
          </div>
        </div>

        {/* Monaco */}
        <div className="min-h-0 flex-1">
          {activeFile ? (
            <Editor
              key={activeFile.path}
              theme="meith"
              path={activeFile.path}
              language={languageForPath(activeFile.path)}
              value={activeFile.content}
              beforeMount={ensureMeithTheme}
              onMount={onMount}
              onChange={(value) => {
                const next = value ?? "";
                setOpen((prev) =>
                  prev.map((f) =>
                    f.path === activeFile.path ? { ...f, content: next } : f,
                  ),
                );
              }}
              options={{
                fontFamily:
                  '"JetBrains Mono", "SFMono-Regular", ui-monospace, Menlo, Consolas, monospace',
                fontSize: 13,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 2,
                renderWhitespace: "selection",
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a file to start editing
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between border-t border-border/60 px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
          <span className="truncate">{activeFile?.path ?? "No file"}</span>
          <span className="flex items-center gap-3">
            {errorCount > 0 && (
              <span className="text-[#c2503f]">{errorCount} errors</span>
            )}
            {warnCount > 0 && (
              <span className="text-[#e0a82e]">{warnCount} warnings</span>
            )}
            {errorCount === 0 && warnCount === 0 && <span>No problems</span>}
          </span>
        </div>
      </div>
    </div>
  );
}

function FileTreeRow({
  node,
  depth,
  activePath,
  expandedDirs,
  loadedDirs,
  loadingDirs,
  truncatedDirs,
  dirErrors,
  onToggleDir,
  onReloadDir,
  onOpenFile,
}: {
  node: FileTreeNode;
  depth: number;
  activePath: string | null;
  expandedDirs: Set<string>;
  loadedDirs: Set<string>;
  loadingDirs: Set<string>;
  truncatedDirs: Set<string>;
  dirErrors: Map<string, string>;
  onToggleDir: (path: string) => void;
  onReloadDir: (path: string) => void;
  onOpenFile: (path: string) => Promise<void>;
}) {
  const expanded = expandedDirs.has(node.path);
  const loaded = loadedDirs.has(node.path);
  const loading = loadingDirs.has(node.path);
  const truncated = truncatedDirs.has(node.path);
  const error = dirErrors.get(node.path);
  const paddingLeft = 10 + depth * 14;

  if (node.type === "dir") {
    return (
      <div>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => onToggleDir(node.path)}
          className="flex w-full items-center gap-1 truncate py-1 pr-2 text-left text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          style={{ paddingLeft }}
          title={node.path}
        >
          <ChevronRightIcon
            className={cn(
              "size-3 shrink-0 transition-transform",
              expanded && "rotate-90",
            )}
          />
          {expanded ? (
            <FolderOpenIcon className="size-3.5 shrink-0 opacity-80" />
          ) : (
            <FolderIcon className="size-3.5 shrink-0 opacity-80" />
          )}
          <span className="truncate">{node.name}</span>
          {loading && <span className="ml-auto text-[10px] opacity-60">...</span>}
        </button>
        {expanded &&
          node.children.map((child) => (
            <FileTreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              expandedDirs={expandedDirs}
              loadedDirs={loadedDirs}
              loadingDirs={loadingDirs}
              truncatedDirs={truncatedDirs}
              dirErrors={dirErrors}
              onToggleDir={onToggleDir}
              onReloadDir={onReloadDir}
              onOpenFile={onOpenFile}
            />
          ))}
        {expanded && error && (
          <button
            type="button"
            className="block w-full truncate py-1 pr-2 text-left text-xs text-[#c2503f] hover:bg-destructive/10"
            style={{ paddingLeft: paddingLeft + 30 }}
            title={error}
            onClick={() => onReloadDir(node.path)}
          >
            Failed to load. Click to retry.
          </button>
        )}
        {expanded && loaded && node.children.length === 0 && (
          <div
            className="truncate py-1 pr-2 text-xs text-muted-foreground/50"
            style={{ paddingLeft: paddingLeft + 30 }}
          >
            Empty
          </div>
        )}
        {expanded && truncated && (
          <div
            className="truncate py-1 pr-2 text-xs text-yellow-500/80"
            style={{ paddingLeft: paddingLeft + 30 }}
          >
            Listing capped at {TREE_PAGE_SIZE.toLocaleString()} entries
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void onOpenFile(node.path)}
      className={cn(
        "flex w-full items-center gap-1.5 truncate py-1 pr-2 text-left text-xs hover:bg-muted/40",
        node.path === activePath
          ? "bg-muted/60 text-foreground"
          : "text-muted-foreground",
      )}
      style={{ paddingLeft: paddingLeft + 16 }}
      title={node.path}
    >
      <FileIcon className="size-3.5 shrink-0 opacity-70" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}
