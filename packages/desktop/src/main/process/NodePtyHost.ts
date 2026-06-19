import { chmodSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { PtyHost, PtyProcess, PtySpawnOptions } from "./PtyHost.js";

/**
 * Real PTY backend powered by `node-pty`.
 *
 * `node-pty` is a native addon and is declared as an OPTIONAL dependency: it is
 * only loaded here, only from the Electron main entry. The headless harness,
 * the socket-only runtime, and tests use `HeadlessPtyHost` instead and never
 * touch this file, so a missing/unbuilt native module can't break them.
 *
 * Use `NodePtyHost.create()`; it resolves the native module up front (so the
 * synchronous `spawn()` contract holds) and throws a clear error if unavailable.
 */

/** Minimal structural types for the bits of `node-pty` we use. */
interface NodePtyDisposable {
  dispose(): void;
}
interface NodePtyInstance {
  pid: number;
  onData(cb: (data: string) => void): NodePtyDisposable;
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): NodePtyDisposable;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}
interface NodePtyModule {
  spawn(
    file: string,
    args: string[] | string,
    options: {
      name?: string;
      cols?: number;
      rows?: number;
      cwd?: string;
      env?: Record<string, string>;
    },
  ): NodePtyInstance;
}

export class NodePtyHost implements PtyHost {
  private constructor(private readonly pty: NodePtyModule) {}

  /** Load `node-pty` and return a host, or throw a clear error if unavailable. */
  static async create(): Promise<NodePtyHost> {
    ensureDarwinSpawnHelperExecutable();

    // A non-literal specifier keeps TypeScript from statically resolving the
    // optional native module (which isn't present in every environment).
    const specifier = "node-pty";
    try {
      const mod = (await import(specifier)) as {
        default?: NodePtyModule;
      } & NodePtyModule;
      const pty = (mod.default ?? mod) as NodePtyModule;
      if (typeof pty.spawn !== "function") {
        throw new Error("module did not export a spawn() function");
      }
      return new NodePtyHost(pty);
    } catch (err) {
      throw new Error(
        `node-pty is unavailable (terminals require the native module): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  spawn(options: PtySpawnOptions): PtyProcess {
    const proc = this.pty.spawn(options.shell, [], {
      name: "xterm-color",
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      // node-pty requires every env value to be a string; an `undefined` entry
      // (common in `process.env`) triggers an opaque "posix_spawnp failed".
      env: sanitizeEnv({ ...process.env, ...options.env }),
    });
    return new NodePtyProcess(proc);
  }
}

const require = createRequire(import.meta.url);

/**
 * node-pty's macOS prebuild can be installed with `spawn-helper` missing its
 * executable bit. The native addon then throws only "posix_spawnp failed",
 * which is accurate but not actionable. Repair the helper before any terminal
 * spawn so the app gets a real PTY instead of degrading to a fake shell.
 */
function ensureDarwinSpawnHelperExecutable(): void {
  if (process.platform !== "darwin") return;

  const packageRoot = dirname(require.resolve("node-pty/package.json"));
  const candidates = [
    join(packageRoot, "build", "Release", "spawn-helper"),
    join(packageRoot, "build", "Debug", "spawn-helper"),
    join(packageRoot, "prebuilds", `${process.platform}-${process.arch}`, "spawn-helper"),
  ].map(physicalAsarPath);

  let found = false;
  for (const helperPath of new Set(candidates)) {
    if (!existsSync(helperPath)) continue;
    found = true;
    const mode = statSync(helperPath).mode;
    if ((mode & 0o111) === 0) chmodSync(helperPath, mode | 0o755);
  }

  if (!found) {
    throw new Error(
      `node-pty spawn-helper was not found under ${packageRoot}; terminals require a native PTY helper on macOS.`,
    );
  }
}

function physicalAsarPath(path: string): string {
  // Electron's asar filesystem makes app.asar paths look readable, but chmod()
  // requires a real file on disk. Native executables must live in *.unpacked.
  return path
    .replace("app.asar", "app.asar.unpacked")
    .replace("node_modules.asar", "node_modules.asar.unpacked");
}

/** Drop entries whose value isn't a string so node-pty's spawn won't abort. */
function sanitizeEnv(env: Record<string, string | undefined>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") clean[key] = value;
  }
  return clean;
}

class NodePtyProcess implements PtyProcess {
  constructor(private readonly proc: NodePtyInstance) {}

  get pid(): number {
    return this.proc.pid;
  }

  write(data: string): void {
    this.proc.write(data);
  }

  resize(cols: number, rows: number): void {
    this.proc.resize(cols, rows);
  }

  kill(signal?: string): void {
    this.proc.kill(signal);
  }

  onData(cb: (chunk: string) => void): () => void {
    const sub = this.proc.onData(cb);
    return () => sub.dispose();
  }

  onExit(cb: (e: { exitCode: number; signal?: number }) => void): () => void {
    const sub = this.proc.onExit(cb);
    return () => sub.dispose();
  }
}
