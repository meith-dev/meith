import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import ts from "typescript";
import type { Logger } from "./Logger.js";

/** A normalized, wire-safe diagnostic emitted by the TypeScript checker. */
export interface Diagnostic {
  file: string;
  severity: "error" | "warning" | "info";
  message: string;
  /** 1-based line. */
  line: number;
  /** 1-based column. */
  column: number;
  /** TypeScript diagnostic code (e.g. 2345), when available. */
  code?: number;
}

export interface FileDiagnostics {
  diagnostics: Diagnostic[];
  /**
   * True when diagnostics are not available for this file/workspace (e.g. a
   * non-TS/JS file, or a workspace where TypeScript could not be initialized).
   * Callers should treat this as "no information", not "no problems".
   */
  unsupported: boolean;
}

const TS_JS_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

/** Default compiler options used when a workspace has no tsconfig.json. */
const DEFAULT_COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  allowJs: true,
  checkJs: false,
  strict: false,
  noEmit: true,
  skipLibCheck: true,
  esModuleInterop: true,
  allowImportingTsExtensions: true,
  resolveJsonModule: true,
};

/**
 * Per-workspace TypeScript language services that provide real syntactic +
 * semantic diagnostics in the main process, so the editor, CLI, and agents all
 * see the same problems through the tool registry.
 *
 * A `LanguageService` is created lazily per workspace root (reading its
 * tsconfig.json when present) and reused across calls. File versions are
 * bumped on `invalidate(...)` so edits are reflected without a full rebuild.
 * Anything that is not TS/JS — or any failure to initialize TypeScript —
 * degrades gracefully to `{ diagnostics: [], unsupported: true }`.
 */
export class DiagnosticsService {
  private readonly services = new Map<string, WorkspaceLanguageService>();

  constructor(private readonly logger: Logger) {}

  getDiagnostics(root: string, absPath?: string): FileDiagnostics {
    if (absPath && !TS_JS_EXTENSIONS.has(extname(absPath).toLowerCase())) {
      return { diagnostics: [], unsupported: true };
    }
    try {
      const ws = this.serviceFor(resolve(root));
      if (!ws) return { diagnostics: [], unsupported: true };
      return ws.diagnose(absPath);
    } catch (err) {
      this.logger.warn(
        "Diagnostics",
        `failed for ${absPath ?? root}: ${(err as Error).message}`,
      );
      return { diagnostics: [], unsupported: true };
    }
  }

  /** Bump a file's version so the next diagnostics pass re-reads it. */
  invalidate(absPath: string): void {
    for (const ws of this.services.values()) ws.bump(resolve(absPath));
  }

  private serviceFor(root: string): WorkspaceLanguageService | null {
    const existing = this.services.get(root);
    if (existing) return existing;
    const ws = new WorkspaceLanguageService(root);
    this.services.set(root, ws);
    return ws;
  }
}

/**
 * Wraps a single `ts.LanguageService` rooted at a workspace directory. Files are
 * added to the project on demand as they are queried; module resolution pulls in
 * their imports for type information.
 */
class WorkspaceLanguageService {
  private readonly service: ts.LanguageService;
  private readonly options: ts.CompilerOptions;
  /** Files explicitly opened/queried, plus tsconfig roots. */
  private readonly rootFiles = new Set<string>();
  /** Monotonic per-file version, bumped on edits. */
  private readonly versions = new Map<string, number>();

  constructor(root: string) {
    this.options = loadCompilerOptions(root);
    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => [...this.rootFiles],
      getScriptVersion: (fileName) => String(this.versions.get(resolve(fileName)) ?? 0),
      getScriptSnapshot: (fileName) => {
        try {
          if (!existsSync(fileName) || statSync(fileName).isDirectory()) return undefined;
          return ts.ScriptSnapshot.fromString(readFileSync(fileName, "utf8"));
        } catch {
          return undefined;
        }
      },
      getCurrentDirectory: () => root,
      getCompilationSettings: () => this.options,
      getDefaultLibFileName: (opts) => ts.getDefaultLibFilePath(opts),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };
    this.service = ts.createLanguageService(host, ts.createDocumentRegistry());
  }

  bump(absPath: string): void {
    if (this.rootFiles.has(absPath)) {
      this.versions.set(absPath, (this.versions.get(absPath) ?? 0) + 1);
    }
  }

  diagnose(absPath?: string): FileDiagnostics {
    if (!absPath) {
      // Whole-project diagnostics: aggregate across the files already opened.
      const all: Diagnostic[] = [];
      for (const file of this.rootFiles) {
        all.push(...this.diagnoseFile(file));
      }
      return { diagnostics: all, unsupported: false };
    }
    const resolved = resolve(absPath);
    if (!this.rootFiles.has(resolved)) {
      this.rootFiles.add(resolved);
      this.versions.set(resolved, 0);
    }
    return { diagnostics: this.diagnoseFile(resolved), unsupported: false };
  }

  private diagnoseFile(fileName: string): Diagnostic[] {
    const raw = [
      ...this.service.getSyntacticDiagnostics(fileName),
      ...this.service.getSemanticDiagnostics(fileName),
    ];
    return raw.map((d) => normalize(d, fileName));
  }
}

function normalize(d: ts.Diagnostic, fallbackFile: string): Diagnostic {
  const file = d.file?.fileName ?? fallbackFile;
  let line = 1;
  let column = 1;
  if (d.file && typeof d.start === "number") {
    const pos = d.file.getLineAndCharacterOfPosition(d.start);
    line = pos.line + 1;
    column = pos.character + 1;
  }
  return {
    file,
    severity: severityOf(d.category),
    message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    line,
    column,
    code: d.code,
  };
}

function severityOf(category: ts.DiagnosticCategory): Diagnostic["severity"] {
  switch (category) {
    case ts.DiagnosticCategory.Error:
      return "error";
    case ts.DiagnosticCategory.Warning:
      return "warning";
    default:
      return "info";
  }
}

/**
 * Read the workspace's tsconfig.json (walking up from the root) and parse its
 * compiler options, falling back to sane defaults when none is found or parsing
 * fails.
 */
function loadCompilerOptions(root: string): ts.CompilerOptions {
  const configPath = findTsConfig(root);
  if (!configPath) return { ...DEFAULT_COMPILER_OPTIONS };
  try {
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    if (read.error) return { ...DEFAULT_COMPILER_OPTIONS };
    const parsed = ts.parseJsonConfigFileContent(
      read.config,
      ts.sys,
      dirname(configPath),
    );
    return {
      ...parsed.options,
      noEmit: true,
      skipLibCheck: true,
    };
  } catch {
    return { ...DEFAULT_COMPILER_OPTIONS };
  }
}

function findTsConfig(root: string): string | null {
  let dir = root;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "tsconfig.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
