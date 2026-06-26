import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const POSIX_SYSTEM_PATHS = [
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
  "/usr/local/sbin",
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];
const PATH_MARKER = "__MEITH_PATH__";

let cachedLoginShellPath: string | undefined;

export interface DesktopExecutablePathOptions {
  env?: NodeJS.ProcessEnv;
  home?: string;
  platform?: NodeJS.Platform;
  cwd?: string;
  resourcesPath?: string;
  loginShellPath?: string;
  prependBins?: string[];
  bundledNodeBinDir?: string;
  bundledNodeRuntimeDir?: string;
}

/**
 * Electron apps launched from Finder inherit a minimal environment, so commands
 * installed by Homebrew, nvm, fnm, Volta, asdf, etc. may be missing even though
 * they work in Terminal. Build a PATH suitable for spawning user CLIs.
 */
export function buildDesktopExecutablePath(
  options: DesktopExecutablePathOptions = {},
): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  const bundledNodeBinDir =
    options.bundledNodeBinDir ?? findBundledNodeRuntimeBinDir(options);
  const parts = [
    ...(options.prependBins ?? []),
    bundledNodeBinDir,
    currentPathValue(env),
    options.loginShellPath ?? queryLoginShellPath(env, platform),
    ...versionManagerPaths(home, platform),
    ...commonUserToolPaths(home, platform),
    ...(platform === "win32" ? [] : POSIX_SYSTEM_PATHS),
  ];

  return dedupePathParts(
    parts.flatMap((part) => splitPath(part, platform)),
    platform,
  );
}

export function withDesktopExecutablePath(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const next = { ...env };
  const pathKey = findPathKey(next) ?? "PATH";
  next[pathKey] = buildDesktopExecutablePath({ env: next });
  return next;
}

export function findBundledNodeRuntimeBinDir(
  options: DesktopExecutablePathOptions = {},
): string | undefined {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const roots = [
    options.bundledNodeRuntimeDir,
    env.MEITH_NODE_RUNTIME_DIR,
    env.MEITH_BUNDLED_NODE_DIR,
    options.resourcesPath
      ? join(options.resourcesPath, "node-runtime")
      : electronResourcesPath()
        ? join(electronResourcesPath() as string, "node-runtime")
        : undefined,
    join(options.cwd ?? process.cwd(), "vendor", "node-runtime"),
  ];

  for (const root of roots) {
    if (!root) continue;
    const binDir = nodeRuntimeBinDir(root, platform);
    if (binDir) return binDir;
  }
  return undefined;
}

function queryLoginShellPath(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string | undefined {
  if (platform === "win32") return undefined;
  if (cachedLoginShellPath !== undefined) return cachedLoginShellPath;

  const shell = env.SHELL && existsSync(env.SHELL) ? env.SHELL : defaultShell();
  if (!shell) {
    cachedLoginShellPath = "";
    return cachedLoginShellPath;
  }

  try {
    const name = basename(shell);
    const loginArgs =
      name === "bash" || name === "zsh" || name === "sh"
        ? ["-l", "-c", `printf '${PATH_MARKER}%s' "$PATH"`]
        : ["-c", `printf '${PATH_MARKER}%s' "$PATH"`];
    const output = execFileSync(shell, loginArgs, {
      encoding: "utf8",
      env,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2_000,
    });
    const markerIndex = output.lastIndexOf(PATH_MARKER);
    cachedLoginShellPath =
      markerIndex >= 0 ? output.slice(markerIndex + PATH_MARKER.length).trim() : "";
  } catch {
    cachedLoginShellPath = "";
  }
  return cachedLoginShellPath;
}

function defaultShell(): string | undefined {
  for (const shell of ["/bin/zsh", "/bin/bash", "/bin/sh"]) {
    if (existsSync(shell)) return shell;
  }
  return undefined;
}

function versionManagerPaths(home: string, platform: NodeJS.Platform): string[] {
  if (platform === "win32") return [];

  const paths = [
    join(home, ".volta", "bin"),
    join(home, ".asdf", "shims"),
    join(home, ".nodenv", "shims"),
    join(home, ".fnm", "aliases", "default", "bin"),
  ];

  const nvmVersions = join(home, ".nvm", "versions", "node");
  if (existsSync(nvmVersions)) {
    for (const version of safeReaddir(nvmVersions)) {
      paths.push(join(nvmVersions, version, "bin"));
    }
  }

  const fnmVersions = join(home, ".fnm", "node-versions");
  if (existsSync(fnmVersions)) {
    for (const version of safeReaddir(fnmVersions)) {
      paths.push(join(fnmVersions, version, "installation", "bin"));
    }
  }

  return paths.filter((path) => existsSync(path));
}

function commonUserToolPaths(home: string, platform: NodeJS.Platform): string[] {
  if (platform === "win32") return [];
  return [
    join(home, ".local", "bin"),
    join(home, ".bun", "bin"),
    join(home, ".cargo", "bin"),
  ];
}

function currentPathValue(env: NodeJS.ProcessEnv): string {
  const key = findPathKey(env);
  return key ? (env[key] ?? "") : "";
}

function findPathKey(env: NodeJS.ProcessEnv): string | undefined {
  return Object.keys(env).find((key) => key.toLowerCase() === "path");
}

function splitPath(value: string | undefined, platform: NodeJS.Platform): string[] {
  return (value ?? "").split(platform === "win32" ? ";" : ":");
}

function electronResourcesPath(): string | undefined {
  return (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
}

function nodeRuntimeBinDir(
  root: string,
  platform: NodeJS.Platform,
): string | undefined {
  const nodeExe = platform === "win32" ? "node.exe" : "node";
  const candidates =
    platform === "win32" ? [root, join(root, "bin")] : [join(root, "bin"), root];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, nodeExe))) return candidate;
  }
  return undefined;
}

function dedupePathParts(parts: string[], platform: NodeJS.Platform): string {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const part of parts.map((p) => p.trim()).filter(Boolean)) {
    if (seen.has(part)) continue;
    seen.add(part);
    deduped.push(part);
  }
  return deduped.join(platform === "win32" ? ";" : ":");
}

function safeReaddir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}
