import {
  type Dirent,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { AppStateService } from "./AppStateService.js";
import { DiagnosticsService, type FileDiagnostics } from "./DiagnosticsService.js";
import type { Logger } from "./Logger.js";
import type { ProjectService } from "./ProjectService.js";

/**
 * A descriptive error whose message tools surface as a typed failure. `code`
 * lets the tool layer map it to the right `ToolErrorCode` (validation vs.
 * generic failure) without leaking Node `fs` errno noise to callers.
 */
export class WorkspaceFileError extends Error {
  constructor(
    message: string,
    readonly kind: "validation" | "failed" = "failed",
  ) {
    super(message);
    this.name = "WorkspaceFileError";
  }
}

/** Options shared by every boundary-checked file operation. */
export interface BoundaryOptions {
  /**
   * Permit a path that resolves outside every known workspace root. Defaults to
   * false — out-of-bounds paths are rejected so tools/agents cannot write
   * arbitrary locations on disk.
   */
  allowOutside?: boolean;
  /** Restrict target paths to the supplied cwd root, not any known workspace. */
  restrictToCwd?: boolean;
}

/** Undo record captured before a mutating write so an edit can be reversed. */
export interface UndoEntry {
  path: string;
  /** Content before the write, or null when the file did not exist. */
  previousContent: string | null;
  /** Content after the write. */
  newContent: string;
  timestamp: number;
}

export interface ReadFileResult {
  path: string;
  content: string;
  encoding: "utf8";
  bytes: number;
  /** True when the file exceeded the read cap and `content` was clipped. */
  truncated: boolean;
}

export interface WriteFileResult {
  path: string;
  bytes: number;
  created: boolean;
  undo: UndoEntry;
}

/** A single structured range edit applied to a file's current text. */
export interface RangeEdit {
  /** UTF-16 character offset where the replacement starts (inclusive). */
  start: number;
  /** UTF-16 character offset where the replacement ends (exclusive). */
  end: number;
  /** Replacement text (empty string deletes the range). */
  newText: string;
}

export interface ApplyPatchResult {
  path: string;
  before: string;
  after: string;
  edits: number;
  undo: UndoEntry;
}

export interface FileEntry {
  /** Path relative to the workspace `cwd`, POSIX-normalized. */
  path: string;
  name: string;
  type: "file" | "dir";
  size?: number;
}

export interface ListFilesResult {
  cwd: string;
  entries: FileEntry[];
  /** True when the listing hit `maxEntries` and was capped. */
  truncated: boolean;
}

export interface SearchMatch {
  path: string;
  line: number;
  column: number;
  text: string;
}

export interface SearchResult {
  matches: SearchMatch[];
  truncated: boolean;
}

const DEFAULT_READ_CAP_BYTES = 2 * 1024 * 1024; // 2 MB
const DEFAULT_MAX_ENTRIES = 5000;
const DEFAULT_MAX_SEARCH_RESULTS = 500;
const DEFAULT_UNDO_DEPTH = 50;
const SEARCH_FILE_CAP_BYTES = 1024 * 1024; // skip files larger than 1 MB when searching

/** Directories never traversed by listings/search (noise + huge trees). */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "out",
  ".turbo",
  ".cache",
  "coverage",
]);

export interface WorkspaceFileServiceOptions {
  /** Max bytes returned by `readFile` before truncation. */
  readCapBytes?: number;
  /** Undo records retained per file. */
  undoDepth?: number;
}

/**
 * The main-process "editor service contract": a single, headless-safe authority
 * for reading, writing, patching, listing, and searching files inside known
 * workspace roots, plus TypeScript diagnostics. Every caller (renderer editor,
 * CLI, future agents) goes through this via the tool registry, so guardrails
 * (workspace boundary enforcement, write logging, undo metadata) are applied
 * uniformly and cannot be bypassed.
 *
 * Boundary model: each call carries a `cwd` that must match a tracked project
 * root or an open workspace-tab root before it can be used as a boundary. A
 * target path is allowed when it resolves inside any tracked root. Anything
 * else is rejected unless the caller opts in with `allowOutside: true` (and
 * every write is logged with that decision).
 */
export class WorkspaceFileService {
  private readonly diagnostics: DiagnosticsService;
  private readonly readCapBytes: number;
  private readonly undoDepth: number;
  /** Per-file undo stacks, keyed by absolute path. */
  private readonly undoStacks = new Map<string, UndoEntry[]>();

  constructor(
    private readonly projects: ProjectService,
    private readonly logger: Logger,
    private readonly appState?: AppStateService,
    options: WorkspaceFileServiceOptions = {},
  ) {
    this.diagnostics = new DiagnosticsService(logger);
    this.readCapBytes = options.readCapBytes ?? DEFAULT_READ_CAP_BYTES;
    this.undoDepth = options.undoDepth ?? DEFAULT_UNDO_DEPTH;
  }

  // ---- Boundary resolution ----------------------------------------------

  /** Known workspace roots: tracked project cwd values and open workspace-tab cwd values. */
  private knownRoots(): string[] {
    const roots = [
      ...this.projects.list().map((p) => canonicalize(p.cwd)),
      ...(this.appState?.getState().workspaceTabs.map((t) => canonicalize(t.cwd)) ?? []),
    ];
    return [...new Set(roots)];
  }

  private trustedCwd(cwd: string, allowOutside?: boolean): string {
    const root = canonicalize(cwd);
    if (this.knownRoots().includes(root)) return root;
    if (allowOutside) return root;
    throw new WorkspaceFileError(
      `Untracked workspace cwd: ${root}. Open it as a project/workspace before using file tools.`,
      "validation",
    );
  }

  /**
   * Resolve `target` (absolute or relative to `cwd`) to an absolute path and
   * enforce the workspace boundary. Returns the resolved absolute path plus the
   * matched root. Throws `WorkspaceFileError` (validation) on escape unless
   * `allowOutside` is set.
   *
   * Boundary enforcement is done against *canonical* (symlink-resolved) paths:
   * both the target and the candidate roots are passed through
   * {@link canonicalize}, which realpaths the deepest existing ancestor before
   * re-appending any not-yet-created segments. This closes the symlink-escape
   * hole where a link inside the workspace points outside it — a lexical check
   * would pass, but the dereferenced read/write would land out of bounds. The
   * returned `absPath` is the canonical path, so every downstream fs call
   * operates on the same location the boundary was checked against.
   */
  resolveInWorkspace(
    cwd: string,
    target: string,
    options: BoundaryOptions = {},
  ): { absPath: string; root: string | null; inside: boolean } {
    if (!cwd || !cwd.trim()) {
      throw new WorkspaceFileError("A workspace cwd is required", "validation");
    }
    const root = this.trustedCwd(cwd, options.allowOutside);
    const lexicalPath = isAbsolute(target) ? resolve(target) : resolve(root, target);
    const absPath = canonicalize(lexicalPath);
    const roots = (options.restrictToCwd ? [root] : this.knownRoots()).map(canonicalize);
    const matched = roots.find((r) => isInside(absPath, r)) ?? null;
    const inside = matched !== null;
    if (!inside && !options.allowOutside) {
      throw new WorkspaceFileError(
        `Path escapes the workspace boundary: ${absPath} (pass allowOutside to override)`,
        "validation",
      );
    }
    return { absPath, root: matched, inside };
  }

  // ---- Reads -------------------------------------------------------------

  readFile(cwd: string, path: string, options: BoundaryOptions = {}): ReadFileResult {
    const { absPath } = this.resolveInWorkspace(cwd, path, options);
    if (!existsSync(absPath)) {
      throw new WorkspaceFileError(`File not found: ${absPath}`, "validation");
    }
    const stat = statSync(absPath);
    if (stat.isDirectory()) {
      throw new WorkspaceFileError(
        `Path is a directory, not a file: ${absPath}`,
        "validation",
      );
    }
    const raw = readFileSync(absPath);
    if (isProbablyBinary(raw)) {
      throw new WorkspaceFileError(
        `Refusing to read binary file: ${absPath}`,
        "validation",
      );
    }
    const truncated = raw.byteLength > this.readCapBytes;
    const slice = truncated ? raw.subarray(0, this.readCapBytes) : raw;
    return {
      path: absPath,
      content: slice.toString("utf8"),
      encoding: "utf8",
      bytes: stat.size,
      truncated,
    };
  }

  listFiles(
    cwd: string,
    options: BoundaryOptions & {
      path?: string;
      recursive?: boolean;
      maxEntries?: number;
    } = {},
  ): ListFilesResult {
    const { absPath: rootAbs } = this.resolveInWorkspace(
      cwd,
      options.path ?? ".",
      options,
    );
    const cap = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    const recursive = options.recursive ?? false;
    if (!existsSync(rootAbs) || !statSync(rootAbs).isDirectory()) {
      throw new WorkspaceFileError(`Not a directory: ${rootAbs}`, "validation");
    }
    const base = canonicalize(cwd);
    const entries: FileEntry[] = [];
    let truncated = false;

    const walk = (dir: string) => {
      if (entries.length >= cap) {
        truncated = true;
        return;
      }
      let dirents: Dirent[];
      try {
        dirents = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      // Directories first, then files; both alphabetical for a stable tree.
      const sorted = [...dirents].sort((a, b) => {
        const da = a.isDirectory() ? 0 : 1;
        const db = b.isDirectory() ? 0 : 1;
        return da !== db ? da - db : a.name.localeCompare(b.name);
      });
      for (const dirent of sorted) {
        if (entries.length >= cap) {
          truncated = true;
          return;
        }
        if (dirent.isDirectory() && IGNORED_DIRS.has(dirent.name)) continue;
        // Skip symlinks: a symlink inside the workspace could point outside it
        // (symlink-escape). Listing the symlink itself is fine but we must not
        // follow it into an external directory or expose its resolved path.
        if (dirent.isSymbolicLink()) continue;
        const child = join(dir, dirent.name);
        const isDir = dirent.isDirectory();
        let size: number | undefined;
        if (!isDir) {
          try {
            size = statSync(child).size;
          } catch {
            size = undefined;
          }
        }
        entries.push({
          path: toPosix(relative(base, child)),
          name: dirent.name,
          type: isDir ? "dir" : "file",
          size,
        });
        if (isDir && recursive) walk(child);
      }
    };

    walk(rootAbs);
    return { cwd: base, entries, truncated };
  }

  search(
    cwd: string,
    options: BoundaryOptions & {
      query: string;
      isRegex?: boolean;
      caseSensitive?: boolean;
      maxResults?: number;
    },
  ): SearchResult {
    const { absPath: rootAbs } = this.resolveInWorkspace(cwd, ".", options);
    const cap = options.maxResults ?? DEFAULT_MAX_SEARCH_RESULTS;
    const base = canonicalize(cwd);
    const matcher = buildMatcher(options.query, options.isRegex, options.caseSensitive);
    const matches: SearchMatch[] = [];
    let truncated = false;

    const walk = (dir: string) => {
      if (matches.length >= cap) {
        truncated = true;
        return;
      }
      let dirents: Dirent[];
      try {
        dirents = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const dirent of dirents) {
        if (matches.length >= cap) {
          truncated = true;
          return;
        }
        // Skip symlinks: a symlink-to-file inside the workspace could point at
        // a sensitive file outside it (symlink-escape read). Only follow real
        // directory entries during recursion.
        if (dirent.isSymbolicLink()) continue;
        if (dirent.isDirectory()) {
          if (IGNORED_DIRS.has(dirent.name)) continue;
          walk(join(dir, dirent.name));
          continue;
        }
        const file = join(dir, dirent.name);
        let raw: Buffer;
        try {
          if (statSync(file).size > SEARCH_FILE_CAP_BYTES) continue;
          raw = readFileSync(file);
        } catch {
          continue;
        }
        if (isProbablyBinary(raw)) continue;
        const rel = toPosix(relative(base, file));
        const lines = raw.toString("utf8").split("\n");
        for (let i = 0; i < lines.length; i++) {
          const col = matcher(lines[i]);
          if (col >= 0) {
            matches.push({ path: rel, line: i + 1, column: col + 1, text: lines[i] });
            if (matches.length >= cap) {
              truncated = true;
              return;
            }
          }
        }
      }
    };

    walk(rootAbs);
    return { matches, truncated };
  }

  getDiagnostics(
    cwd: string,
    path?: string,
    options: BoundaryOptions = {},
  ): FileDiagnostics {
    const root = resolve(cwd);
    const absPath = path
      ? this.resolveInWorkspace(cwd, path, options).absPath
      : undefined;
    return this.diagnostics.getDiagnostics(root, absPath);
  }

  // ---- Writes ------------------------------------------------------------

  writeFile(
    cwd: string,
    path: string,
    content: string,
    options: BoundaryOptions & { createDirs?: boolean } = {},
  ): WriteFileResult {
    const { absPath, root, inside } = this.resolveInWorkspace(cwd, path, options);
    const created = !existsSync(absPath);
    if (!created && statSync(absPath).isDirectory()) {
      throw new WorkspaceFileError(`Path is a directory: ${absPath}`, "validation");
    }
    const previousContent = created ? null : readFileSync(absPath, "utf8");
    if (created || options.createDirs) {
      mkdirSync(dirname(absPath), { recursive: true });
    }
    writeFileSync(absPath, content, "utf8");
    const bytes = Buffer.byteLength(content, "utf8");
    const undo = this.pushUndo({
      path: absPath,
      previousContent,
      newContent: content,
      timestamp: Date.now(),
    });
    this.diagnostics.invalidate(absPath);
    this.logWrite(
      "write",
      absPath,
      previousContent,
      content,
      inside,
      options.allowOutside,
    );
    this.publishFileEvent(
      "write",
      root ?? resolve(cwd),
      absPath,
      previousContent,
      content,
    );
    return { path: absPath, bytes, created, undo };
  }

  applyPatch(
    cwd: string,
    path: string,
    edits: RangeEdit[],
    options: BoundaryOptions = {},
  ): ApplyPatchResult {
    const { absPath, root, inside } = this.resolveInWorkspace(cwd, path, options);
    if (!existsSync(absPath)) {
      throw new WorkspaceFileError(`File not found: ${absPath}`, "validation");
    }
    if (statSync(absPath).isDirectory()) {
      throw new WorkspaceFileError(`Path is a directory: ${absPath}`, "validation");
    }
    const before = readFileSync(absPath, "utf8");
    const after = applyRangeEdits(before, edits);
    writeFileSync(absPath, after, "utf8");
    const undo = this.pushUndo({
      path: absPath,
      previousContent: before,
      newContent: after,
      timestamp: Date.now(),
    });
    this.diagnostics.invalidate(absPath);
    this.logWrite("patch", absPath, before, after, inside, options.allowOutside);
    this.publishFileEvent("patch", root ?? resolve(cwd), absPath, before, after);
    return { path: absPath, before, after, edits: edits.length, undo };
  }

  /**
   * Reverse the most recent write/patch to a file, restoring its previous
   * content, or deleting it if it was newly created. Returns the undo entry.
   */
  undoLast(cwd: string, path: string, options: BoundaryOptions = {}): UndoEntry | null {
    const { absPath, root } = this.resolveInWorkspace(cwd, path, options);
    const stack = this.undoStacks.get(absPath);
    const entry = stack?.pop();
    if (!entry) return null;
    if (entry.previousContent === null) {
      rmSync(absPath, { force: true });
    } else {
      writeFileSync(absPath, entry.previousContent, "utf8");
    }
    this.diagnostics.invalidate(absPath);
    this.logger.info(
      "WorkspaceFile",
      entry.previousContent === null
        ? `undo ${absPath} (deleted newly-created file)`
        : `undo ${absPath} (restored ${entry.previousContent.length} chars)`,
    );
    this.publishFileEvent(
      "undo",
      root ?? resolve(cwd),
      absPath,
      entry.newContent,
      entry.previousContent,
    );
    return entry;
  }

  /** Inspect the undo stack depth for a file (used by the renderer/tests). */
  undoDepthFor(cwd: string, path: string, options: BoundaryOptions = {}): number {
    const { absPath } = this.resolveInWorkspace(cwd, path, options);
    return this.undoStacks.get(absPath)?.length ?? 0;
  }

  // ---- Internals ---------------------------------------------------------

  private pushUndo(entry: UndoEntry): UndoEntry {
    const stack = this.undoStacks.get(entry.path) ?? [];
    stack.push(entry);
    while (stack.length > this.undoDepth) stack.shift();
    this.undoStacks.set(entry.path, stack);
    return entry;
  }

  private logWrite(
    op: "write" | "patch",
    absPath: string,
    before: string | null,
    after: string,
    inside: boolean,
    allowOutside?: boolean,
  ): void {
    const delta =
      Buffer.byteLength(after, "utf8") - (before ? Buffer.byteLength(before, "utf8") : 0);
    const boundary = inside
      ? "in-workspace"
      : `out-of-workspace${allowOutside ? " (allowed)" : ""}`;
    this.logger.info(
      "WorkspaceFile",
      `${op} ${absPath} (${delta >= 0 ? "+" : ""}${delta} bytes, ${boundary})`,
    );
  }

  private publishFileEvent(
    op: "write" | "patch" | "undo",
    root: string,
    absPath: string,
    before: string | null,
    after: string | null,
  ): void {
    if (!this.appState) return;
    const cwd = resolve(root);
    const path = toPosix(relative(cwd, absPath));
    const event = {
      id: `fevt_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`,
      ts: Date.now(),
      op,
      cwd,
      path,
      before,
      after,
    };
    this.appState.update((draft) => {
      draft.workspaceFileEvents = [...(draft.workspaceFileEvents ?? []), event].slice(
        -100,
      );
    }, "workspace_file_event");
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Resolve `p` to a canonical, symlink-free absolute path so boundary checks
 * cannot be fooled by symlinks. Because the target may not exist yet (new file
 * writes), we realpath the deepest *existing* ancestor and then re-append the
 * remaining, not-yet-created segments. This means a symlinked directory in the
 * middle of the path is fully dereferenced before the workspace boundary is
 * evaluated. Falls back to a lexical `resolve` if realpath fails.
 */
function canonicalize(p: string): string {
  let current = resolve(p);
  const trailing: string[] = [];
  // Walk up until we find a path that exists on disk.
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) {
      // Reached the filesystem root without finding anything that exists.
      return resolve(p);
    }
    trailing.push(basename(current));
    current = parent;
  }
  let real: string;
  try {
    real = realpathSync.native(current);
  } catch {
    real = current;
  }
  // trailing was collected deepest-first; reverse to descend from the ancestor.
  return trailing.length > 0 ? resolve(real, ...trailing.reverse()) : real;
}

/** True when `child` is the same as, or nested under, `parent`. */
function isInside(child: string, parent: string): boolean {
  if (child === parent) return true;
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function toPosix(p: string): string {
  return sep === "/" ? p : p.split(sep).join("/");
}

/** Heuristic binary sniff: a NUL byte in the first 8 KB. */
function isProbablyBinary(buf: Buffer): boolean {
  const limit = Math.min(buf.length, 8192);
  for (let i = 0; i < limit; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

/**
 * Apply non-overlapping range edits to `text`. Edits are validated (in-bounds,
 * start<=end, no overlap) and applied right-to-left so earlier offsets stay
 * valid. Throws `WorkspaceFileError(validation)` on any malformed edit.
 */
export function applyRangeEdits(text: string, edits: RangeEdit[]): string {
  if (edits.length === 0) return text;
  const len = text.length;
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  let prevEnd = -1;
  for (const edit of sorted) {
    if (
      !Number.isInteger(edit.start) ||
      !Number.isInteger(edit.end) ||
      edit.start < 0 ||
      edit.end < edit.start ||
      edit.end > len
    ) {
      throw new WorkspaceFileError(
        `Invalid edit range [${edit.start}, ${edit.end}] for content of length ${len}`,
        "validation",
      );
    }
    if (edit.start < prevEnd) {
      throw new WorkspaceFileError(
        `Overlapping edit at offset ${edit.start} (previous edit ended at ${prevEnd})`,
        "validation",
      );
    }
    prevEnd = edit.end;
  }
  let result = text;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const edit = sorted[i];
    result = result.slice(0, edit.start) + edit.newText + result.slice(edit.end);
  }
  return result;
}

/**
 * Build a per-line matcher returning the 0-based column of the first match, or
 * -1. Supports plain substring and regex queries.
 */
function buildMatcher(
  query: string,
  isRegex?: boolean,
  caseSensitive?: boolean,
): (line: string) => number {
  if (!query) throw new WorkspaceFileError("Search query is required", "validation");
  if (isRegex) {
    let re: RegExp;
    try {
      re = new RegExp(query, caseSensitive ? "" : "i");
    } catch (err) {
      throw new WorkspaceFileError(
        `Invalid regex: ${(err as Error).message}`,
        "validation",
      );
    }
    return (line: string) => {
      const m = re.exec(line);
      return m ? m.index : -1;
    };
  }
  if (caseSensitive) return (line: string) => line.indexOf(query);
  const needle = query.toLowerCase();
  return (line: string) => line.toLowerCase().indexOf(needle);
}
