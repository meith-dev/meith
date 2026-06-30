import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { type ToolDefinition, defineTool } from "@meith/protocol";
import { type GitIdentityProfile, okResult } from "@meith/shared";
import { z } from "zod";
import type { ToolDeps } from "./deps.js";

const pexec = promisify(execFile);

/** The well-known SHA of git's empty tree; used to diff repos with no commits. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
/** Generous buffer so large diffs aren't truncated by the default 1 MB cap. */
const MAX_BUFFER = 64 * 1024 * 1024;
const MAX_UNTRACKED_PATCH_BYTES = 512 * 1024;
const CHECKPOINT_REF_PREFIX = "refs/meith/checkpoints";
const ACCOUNT_DETECT_TIMEOUT_MS = 3_000;

const cwdSchema = z.string().min(1).describe("A path inside the git repository.");
const pathSchema = z.string().min(1).describe("A repository-relative path.");
const pathsSchema = z.array(pathSchema).min(1);
const diffScopeSchema = z.enum(["all", "staged", "unstaged"]).default("all");

/** A single changed file with its unified diff and line counts. */
export interface GitDiffFile {
  /** Path relative to the repository root. */
  path: string;
  /** modified | added | deleted | renamed | copied | untracked. */
  status: string;
  additions: number;
  deletions: number;
  binary: boolean;
  /** The unified (git-style) patch for this file. Empty for binary files. */
  diff: string;
}

/** The summarized working-tree diff for a project directory. */
export interface GitDiffResult {
  isRepo: boolean;
  /** Absolute repository root, or null when `cwd` isn't inside a repo. */
  root: string | null;
  scope: "all" | "staged" | "unstaged";
  files: GitDiffFile[];
  totalAdditions: number;
  totalDeletions: number;
}

export interface GitStatusFile {
  path: string;
  originalPath?: string;
  status: string;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export interface GitStatusResult {
  isRepo: boolean;
  root: string | null;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitStatusFile[];
  staged: GitStatusFile[];
  unstaged: GitStatusFile[];
  untracked: GitStatusFile[];
  clean: boolean;
}

interface GitCheckpointMeta {
  id: string;
  ref: string;
  root: string;
  baseHead: string | null;
  createdAt: number;
  label?: string;
  source?: string;
  sessionId?: string;
  toolCallId?: string;
}

interface GitIdentitySuggestion {
  source: "repo" | "global" | "github-cli" | "gitlab-cli";
  label: string;
  name: string;
  email: string;
  username?: string;
  host?: string;
  detail: string;
}

/**
 * Git inspection tools. `git_diff` reports the project's working-tree changes
 * (staged + unstaged vs HEAD, plus untracked files) as structured per-file
 * unified diffs. It's read-only and routed through the same registry every
 * caller uses, so the Git panel, the CLI, and agents share it.
 */
export function createGitTools(deps: ToolDeps): ToolDefinition[] {
  const gitDiff = defineTool({
    name: "git_diff",
    description:
      "Summarize a project's working-tree changes (vs HEAD, including untracked files) as per-file unified diffs with +/- line counts.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      cwd: cwdSchema,
      includePatches: z
        .boolean()
        .optional()
        .describe("When false, return file/status/count summaries without patch bodies."),
      path: z
        .string()
        .min(1)
        .optional()
        .describe(
          "When includePatches is true, only include the patch body for this repository-relative path.",
        ),
      scope: diffScopeSchema.describe(
        "Which changes to diff: all changes vs HEAD, staged changes, or unstaged changes.",
      ),
    }),
    execute: async (_ctx, input) =>
      okResult(
        await computeDiff(
          input.cwd,
          input.includePatches !== false,
          input.path,
          input.scope,
        ),
      ),
  });

  const gitStatus = defineTool({
    name: "git_status",
    description:
      "Return structured git status with staged, unstaged, and untracked file sections.",
    capabilities: ["read-only"],
    inputSchema: z.object({ cwd: cwdSchema }),
    execute: async (_ctx, input) => okResult(await computeStatus(input.cwd)),
  });

  const gitIdentityDetect = defineTool({
    name: "git_identity_detect",
    description:
      "Detect local Git commit identity suggestions from repo/global git config and installed provider CLIs.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      cwd: cwdSchema.optional(),
    }),
    execute: async (_ctx, input) => okResult(await detectGitIdentities(input.cwd)),
  });

  const gitBranch = defineTool({
    name: "git_branch",
    description: "List, create, or switch git branches.",
    capabilities: ["writes-files"],
    inputSchema: z.object({
      cwd: cwdSchema,
      action: z.enum(["list", "create", "switch"]).default("list"),
      name: z.string().min(1).optional(),
      startPoint: z.string().min(1).optional(),
    }),
    execute: async (_ctx, input) => okResult(await branchAction(input)),
  });

  const gitCommit = defineTool({
    name: "git_commit",
    description: "Create a git commit from the current index.",
    capabilities: ["writes-files"],
    inputSchema: z.object({
      cwd: cwdSchema,
      message: z.string().min(1),
    }),
    execute: async (_ctx, input) =>
      okResult(await commit(input.cwd, input.message, activeCommitIdentity(deps))),
  });

  const gitStage = defineTool({
    name: "git_stage",
    description: "Stage one or more files, or apply a supplied patch to the index.",
    capabilities: ["writes-files"],
    inputSchema: z.object({
      cwd: cwdSchema,
      paths: pathsSchema.optional(),
      patch: z.string().min(1).optional(),
    }),
    execute: async (_ctx, input) =>
      okResult(await stage(input.cwd, input.paths, input.patch)),
  });

  const gitUnstage = defineTool({
    name: "git_unstage",
    description: "Unstage one or more files, or reverse a supplied staged patch.",
    capabilities: ["writes-files"],
    inputSchema: z.object({
      cwd: cwdSchema,
      paths: pathsSchema.optional(),
      patch: z.string().min(1).optional(),
    }),
    execute: async (_ctx, input) =>
      okResult(await unstage(input.cwd, input.paths, input.patch)),
  });

  const gitRestore = defineTool({
    name: "git_restore",
    description: "Restore file or hunk changes with guardrails for destructive actions.",
    capabilities: ["destructive"],
    inputSchema: z.object({
      cwd: cwdSchema,
      paths: pathsSchema.optional(),
      patch: z.string().min(1).optional(),
      target: z.enum(["worktree", "staged", "both"]).default("worktree"),
      confirm: z.literal(true).describe("Must be true to confirm destructive restore."),
    }),
    execute: async (_ctx, input) =>
      okResult(await restore(input.cwd, input.target, input.paths, input.patch)),
  });

  const gitLog = defineTool({
    name: "git_log",
    description: "Return recent git commits for a repository.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      cwd: cwdSchema,
      limit: z.number().int().min(1).max(200).default(30),
      path: pathSchema.optional(),
    }),
    execute: async (_ctx, input) =>
      okResult(await log(input.cwd, input.limit, input.path)),
  });

  const gitBlame = defineTool({
    name: "git_blame",
    description: "Return porcelain git blame information for a file.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      cwd: cwdSchema,
      path: pathSchema,
      startLine: z.number().int().min(1).optional(),
      endLine: z.number().int().min(1).optional(),
    }),
    execute: async (_ctx, input) =>
      okResult(await blame(input.cwd, input.path, input.startLine, input.endLine)),
  });

  const gitWorktree = defineTool({
    name: "git_worktree",
    description: "List, create, or remove git worktrees.",
    capabilities: ["writes-files"],
    inputSchema: z.object({
      cwd: cwdSchema,
      action: z.enum(["list", "create", "remove"]).default("list"),
      path: z.string().min(1).optional(),
      branch: z.string().min(1).optional(),
      startPoint: z.string().min(1).optional(),
      force: z.boolean().default(false),
      confirm: z.boolean().default(false),
    }),
    execute: async (_ctx, input) => okResult(await worktreeAction(input)),
  });

  const gitCheckpointCreate = defineTool({
    name: "git_checkpoint_create",
    description:
      "Create a git-backed checkpoint of the current worktree without changing the user's index or files.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      cwd: cwdSchema,
      label: z.string().min(1).optional(),
      source: z.string().min(1).optional(),
      sessionId: z.string().min(1).optional(),
      toolCallId: z.string().min(1).optional(),
    }),
    execute: async (_ctx, input) => okResult(await createCheckpoint(input)),
  });

  const gitCheckpointList = defineTool({
    name: "git_checkpoint_list",
    description: "List git checkpoints created by Meith.",
    capabilities: ["read-only"],
    inputSchema: z.object({ cwd: cwdSchema }),
    execute: async (_ctx, input) => okResult(await listCheckpoints(input.cwd)),
  });

  const gitCheckpointRestore = defineTool({
    name: "git_checkpoint_restore",
    description:
      "Restore the worktree content from a Meith checkpoint without moving the current branch.",
    capabilities: ["destructive"],
    inputSchema: z.object({
      cwd: cwdSchema,
      id: z.string().min(1),
      confirm: z.literal(true).describe("Must be true to restore checkpoint content."),
    }),
    execute: async (_ctx, input) =>
      okResult(await restoreCheckpoint(input.cwd, input.id)),
  });

  const gitCheckpointCompare = defineTool({
    name: "git_checkpoint_compare",
    description: "Compare two Meith checkpoints, or a checkpoint against HEAD.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      cwd: cwdSchema,
      left: z.string().min(1),
      right: z.string().min(1).optional(),
      includePatch: z.boolean().default(false),
    }),
    execute: async (_ctx, input) =>
      okResult(
        await compareCheckpoints(input.cwd, input.left, input.right, input.includePatch),
      ),
  });

  return [
    gitDiff,
    gitStatus,
    gitIdentityDetect,
    gitBranch,
    gitCommit,
    gitStage,
    gitUnstage,
    gitRestore,
    gitLog,
    gitBlame,
    gitWorktree,
    gitCheckpointCreate,
    gitCheckpointList,
    gitCheckpointRestore,
    gitCheckpointCompare,
  ];
}

/** Run git, returning stdout. Throws on non-zero exit. */
async function git(
  cwd: string,
  args: string[],
  options: { input?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<string> {
  if (options.input !== undefined) return gitWithInput(cwd, args, options);
  const { stdout } = await pexec("git", args, {
    cwd,
    maxBuffer: MAX_BUFFER,
    env: options.env ? { ...process.env, ...options.env } : undefined,
  });
  return stdout;
}

function gitWithInput(
  cwd: string,
  args: string[],
  options: { input?: string; env?: NodeJS.ProcessEnv },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: options.env ? { ...process.env, ...options.env } : undefined,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > MAX_BUFFER) {
        child.kill();
        reject(new Error("git stdout exceeded max buffer"));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `git exited with code ${code}`));
    });
    child.stdin.end(options.input ?? "");
  });
}

async function repoRoot(cwd: string): Promise<string | null> {
  try {
    return (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    return null;
  }
}

async function headOrNull(root: string): Promise<string | null> {
  try {
    return (await git(root, ["rev-parse", "--verify", "HEAD"])).trim();
  } catch {
    return null;
  }
}

async function computeDiff(
  cwd: string,
  includePatches: boolean,
  pathFilter?: string,
  scope: "all" | "staged" | "unstaged" = "all",
): Promise<GitDiffResult> {
  const root = await repoRoot(cwd);
  if (!root) {
    // Not a git repository (or git missing): report an empty, non-repo result
    // rather than failing the tool — the UI renders an "untracked" empty state.
    return {
      isRepo: false,
      root: null,
      scope,
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
    };
  }

  // Diff against HEAD normally, or the empty tree for a repo with no commits.
  const base = (await headOrNull(root)) ? "HEAD" : EMPTY_TREE;

  const files: GitDiffFile[] = [];

  // --- Tracked changes (staged + unstaged) vs the base ---------------------
  const quote = ["-c", "core.quotepath=false", "-c", "color.ui=false"];
  const diffArgs = diffArgsForScope(scope, base);
  const numstat = (await git(root, [...quote, ...diffArgs, "--numstat"])).trim();
  const nameStatus = (await git(root, [...quote, ...diffArgs, "--name-status"])).trim();
  const statusMap = parseNameStatus(nameStatus);
  const patchByPath = includePatches
    ? splitPatch(
        await git(
          root,
          pathFilter
            ? [...quote, ...diffArgs, "--", pathFilter]
            : [...quote, ...diffArgs],
        ),
      )
    : new Map<string, string>();

  if (numstat) {
    for (const line of numstat.split("\n")) {
      if (!line) continue;
      const [addRaw, delRaw, ...rest] = line.split("\t");
      const path = rest.join("\t");
      if (!path) continue;
      const binary = addRaw === "-" || delRaw === "-";
      files.push({
        path,
        status: statusMap.get(path) ?? "modified",
        additions: binary ? 0 : Number.parseInt(addRaw, 10) || 0,
        deletions: binary ? 0 : Number.parseInt(delRaw, 10) || 0,
        binary,
        diff: includePatches ? (patchByPath.get(path) ?? "") : "",
      });
    }
  }

  // --- Untracked files (new, not yet staged) -------------------------------
  const includeUntracked = scope === "all" || scope === "unstaged";
  const untracked = includeUntracked
    ? (await git(root, ["ls-files", "--others", "--exclude-standard"])).trim()
    : "";
  if (includeUntracked && untracked) {
    for (const rel of untracked.split("\n")) {
      if (!rel) continue;
      const shouldLoadPatch = includePatches && (!pathFilter || rel === pathFilter);
      const summary = await untrackedSummary(root, quote, rel);
      const patch = shouldLoadPatch ? await untrackedPatch(root, quote, rel) : "";
      const binary = shouldLoadPatch
        ? summary.binary || /^Binary files /m.test(patch)
        : summary.binary;
      files.push({
        path: rel,
        status: "untracked",
        additions: binary ? 0 : summary.additions,
        deletions: 0,
        binary,
        diff: binary ? "" : patch,
      });
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
  return { isRepo: true, root, scope, files, totalAdditions, totalDeletions };
}

function diffArgsForScope(scope: "all" | "staged" | "unstaged", base: string): string[] {
  if (scope === "staged") return ["diff", "--cached", base];
  if (scope === "unstaged") return ["diff"];
  return ["diff", base];
}

async function untrackedSummary(
  root: string,
  quote: string[],
  rel: string,
): Promise<{ additions: number; binary: boolean }> {
  const out = await gitDiffMayExit(
    root,
    [...quote, "diff", "--no-index", "--numstat", "--", "/dev/null", rel],
    MAX_BUFFER,
  );
  const line = out
    .trim()
    .split("\n")
    .find((entry) => entry.trim());
  if (!line) return { additions: 0, binary: false };
  const [addRaw, delRaw] = line.split("\t");
  const binary = addRaw === "-" || delRaw === "-";
  return {
    additions: binary ? 0 : Number.parseInt(addRaw ?? "0", 10) || 0,
    binary,
  };
}

async function untrackedPatch(
  root: string,
  quote: string[],
  rel: string,
): Promise<string> {
  try {
    const { stdout } = await pexec(
      "git",
      [...quote, "diff", "--no-index", "--", "/dev/null", rel],
      {
        cwd: root,
        maxBuffer: MAX_UNTRACKED_PATCH_BYTES,
      },
    );
    return stdout;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      return `diff --git a/${rel} b/${rel}\n--- /dev/null\n+++ b/${rel}\n@@\n+Large untracked file omitted from preview.\n`;
    }
    const out = (err as { stdout?: string }).stdout;
    if (typeof out === "string") return out;
    throw err;
  }
}

async function gitDiffMayExit(
  cwd: string,
  args: string[],
  maxBuffer: number,
): Promise<string> {
  try {
    const { stdout } = await pexec("git", args, { cwd, maxBuffer });
    return stdout;
  } catch (err) {
    const out = (err as { stdout?: string }).stdout;
    if (typeof out === "string") return out;
    throw err;
  }
}

/** Map each path to a human status from `git diff --name-status` output. */
function parseNameStatus(out: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!out) return map;
  for (const line of out.split("\n")) {
    if (!line) continue;
    const parts = line.split("\t");
    const code = parts[0] ?? "";
    // For renames/copies the final column is the new path.
    const path = parts[parts.length - 1];
    if (path) map.set(path, mapStatus(code));
  }
  return map;
}

function mapStatus(code: string): string {
  switch (code[0]) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    default:
      return "modified";
  }
}

async function computeStatus(cwd: string): Promise<GitStatusResult> {
  const root = await repoRoot(cwd);
  if (!root) {
    return {
      isRepo: false,
      root: null,
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [],
      staged: [],
      unstaged: [],
      untracked: [],
      clean: true,
    };
  }

  const files = parsePorcelainStatus(
    await git(root, ["-c", "core.quotepath=false", "status", "--porcelain=v1", "-z"]),
  );
  const branch = await branchName(root);
  const upstream = await upstreamName(root);
  const { ahead, behind } = await aheadBehind(root, upstream);
  return {
    isRepo: true,
    root,
    branch,
    upstream,
    ahead,
    behind,
    files,
    staged: files.filter((file) => file.staged),
    unstaged: files.filter((file) => file.unstaged),
    untracked: files.filter((file) => file.untracked),
    clean: files.length === 0,
  };
}

async function detectGitIdentities(cwd?: string) {
  const suggestions: GitIdentitySuggestion[] = [];
  let root: string | null = null;

  const globalName = await optionalCommand("git", [
    "config",
    "--global",
    "--get",
    "user.name",
  ]);
  const globalEmail = await optionalCommand("git", [
    "config",
    "--global",
    "--get",
    "user.email",
  ]);
  if (globalName && globalEmail) {
    suggestions.push({
      source: "global",
      label: "Global Git config",
      name: globalName,
      email: globalEmail,
      detail: "Configured with git config --global user.name/user.email.",
    });
  }

  if (cwd) {
    try {
      root = await requireRepo(cwd);
      const repoName = await optionalCommand("git", ["config", "--get", "user.name"], {
        cwd: root,
      });
      const repoEmail = await optionalCommand("git", ["config", "--get", "user.email"], {
        cwd: root,
      });
      if (repoName && repoEmail) {
        suggestions.push({
          source: "repo",
          label: "Current repository",
          name: repoName,
          email: repoEmail,
          detail:
            "Effective identity for this repository, including local and conditional Git config.",
        });
      }
    } catch {
      root = null;
    }
  }

  suggestions.push(...(await detectGitHubCliAccounts()));
  suggestions.push(...(await detectGitLabCliAccounts()));

  return {
    root,
    suggestions: uniqueIdentitySuggestions(suggestions),
  };
}

async function detectGitHubCliAccounts(): Promise<GitIdentitySuggestion[]> {
  const output = await optionalCommand("gh", ["auth", "status"]);
  if (!output) return [];

  const suggestions: GitIdentitySuggestion[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/Logged in to\s+(\S+)\s+account\s+([^\s(]+)/i);
    if (!match) continue;
    const [, host, username] = match;
    suggestions.push({
      source: "github-cli",
      label: `GitHub: ${username}`,
      name: username,
      email: `${username}@users.noreply.github.com`,
      username,
      host,
      detail: "Detected from GitHub CLI login. Uses GitHub's noreply email pattern.",
    });
  }
  return suggestions;
}

async function detectGitLabCliAccounts(): Promise<GitIdentitySuggestion[]> {
  const output = await optionalCommand("glab", ["auth", "status"]);
  if (!output) return [];

  const suggestions: GitIdentitySuggestion[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match =
      line.match(/Logged in to\s+(\S+)\s+as\s+([^\s(]+)/i) ??
      line.match(/^(\S+):\s+Logged in.*\sas\s+([^\s(]+)/i);
    if (!match) continue;
    const [, host, username] = match;
    suggestions.push({
      source: "gitlab-cli",
      label: `GitLab: ${username}`,
      name: username,
      email: `${username}@users.noreply.gitlab.com`,
      username,
      host,
      detail: "Detected from GitLab CLI login. Uses GitLab's noreply email pattern.",
    });
  }
  return suggestions;
}

async function optionalCommand(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<string | null> {
  try {
    const { stdout, stderr } = await pexec(command, args, {
      cwd: options.cwd,
      maxBuffer: MAX_BUFFER,
      timeout: ACCOUNT_DETECT_TIMEOUT_MS,
    });
    return `${stdout}${stderr}`.trim() || null;
  } catch {
    return null;
  }
}

function uniqueIdentitySuggestions(
  suggestions: GitIdentitySuggestion[],
): GitIdentitySuggestion[] {
  const seen = new Set<string>();
  const unique: GitIdentitySuggestion[] = [];
  for (const suggestion of suggestions) {
    const key = `${suggestion.name.trim().toLowerCase()}\0${suggestion.email
      .trim()
      .toLowerCase()}`;
    if (!suggestion.name.trim() || !suggestion.email.trim() || seen.has(key)) continue;
    seen.add(key);
    unique.push({
      ...suggestion,
      label: suggestion.label.trim(),
      name: suggestion.name.trim(),
      email: suggestion.email.trim(),
    });
  }
  return unique;
}

function parsePorcelainStatus(out: string): GitStatusFile[] {
  const entries = out.split("\0").filter(Boolean);
  const files: GitStatusFile[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const indexStatus = entry[0] ?? " ";
    const worktreeStatus = entry[1] ?? " ";
    const rawPath = entry.slice(3);
    const path = rawPath;
    let originalPath: string | undefined;
    if (indexStatus === "R" || indexStatus === "C") {
      originalPath = entries[i + 1];
      i += 1;
    }
    const untracked = indexStatus === "?" && worktreeStatus === "?";
    files.push({
      path,
      originalPath,
      status: untracked ? "untracked" : mapStatus(indexStatus + worktreeStatus),
      indexStatus,
      worktreeStatus,
      staged: !untracked && indexStatus !== " " && indexStatus !== "?",
      unstaged: !untracked && worktreeStatus !== " " && worktreeStatus !== "?",
      untracked,
    });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function branchName(root: string): Promise<string | null> {
  const name = (await git(root, ["branch", "--show-current"])).trim();
  if (name) return name;
  const head = await headOrNull(root);
  return head ? head.slice(0, 12) : null;
}

async function upstreamName(root: string): Promise<string | null> {
  try {
    const upstream = (
      await git(root, ["rev-parse", "--abbrev-ref", "@{upstream}"])
    ).trim();
    return upstream || null;
  } catch {
    return null;
  }
}

async function aheadBehind(
  root: string,
  upstream: string | null,
): Promise<{ ahead: number; behind: number }> {
  if (!upstream) return { ahead: 0, behind: 0 };
  try {
    const out = (
      await git(root, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`])
    )
      .trim()
      .split(/\s+/);
    return {
      behind: Number.parseInt(out[0] ?? "0", 10) || 0,
      ahead: Number.parseInt(out[1] ?? "0", 10) || 0,
    };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}

async function branchAction(input: {
  cwd: string;
  action: "list" | "create" | "switch";
  name?: string;
  startPoint?: string;
}) {
  const root = await requireRepo(input.cwd);
  if (input.action === "create") {
    if (!input.name) throw new Error("Branch name is required.");
    await git(root, [
      "branch",
      input.name,
      ...(input.startPoint ? [input.startPoint] : []),
    ]);
  } else if (input.action === "switch") {
    if (!input.name) throw new Error("Branch name is required.");
    await git(root, ["switch", input.name]);
  }
  return listBranches(root);
}

async function listBranches(root: string) {
  const out = await git(root, [
    "for-each-ref",
    "--format=%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(objectname:short)%00%(contents:subject)",
    "refs/heads",
  ]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, head, upstream, commit, subject] = line.split("\0");
      return {
        name,
        current: head === "*",
        upstream: upstream || null,
        commit,
        subject: subject || "",
      };
    });
}

function activeCommitIdentity(deps: ToolDeps): GitIdentityProfile | null {
  const gitSettings = deps.appState?.getState().settings.git;
  const activeId = gitSettings?.activeIdentityProfileId;
  if (!activeId) return null;
  const profile = gitSettings.identityProfiles.find((item) => item.id === activeId);
  if (!profile) {
    throw new Error("Active git identity profile no longer exists.");
  }
  if (!profile.name.trim() || !profile.email.trim()) {
    throw new Error("Active git identity profile requires both a name and email.");
  }
  return profile;
}

async function commit(
  cwd: string,
  message: string,
  identity: GitIdentityProfile | null = null,
) {
  const root = await requireRepo(cwd);
  const args = identity
    ? [
        "commit",
        "--author",
        `${identity.name.trim()} <${identity.email.trim()}>`,
        "-m",
        message,
      ]
    : ["commit", "-m", message];
  const env = identity
    ? {
        GIT_COMMITTER_NAME: identity.name.trim(),
        GIT_COMMITTER_EMAIL: identity.email.trim(),
      }
    : undefined;
  const out = await git(root, args, { env });
  return { output: out.trim(), status: await computeStatus(root) };
}

async function stage(cwd: string, paths?: string[], patch?: string) {
  const root = await requireRepo(cwd);
  if (patch) {
    await git(root, ["apply", "--cached", "--whitespace=nowarn"], { input: patch });
  } else {
    if (!paths?.length) throw new Error("paths or patch is required.");
    await git(root, ["add", "--", ...paths]);
  }
  return computeStatus(root);
}

async function unstage(cwd: string, paths?: string[], patch?: string) {
  const root = await requireRepo(cwd);
  if (patch) {
    await git(root, ["apply", "--cached", "--reverse", "--whitespace=nowarn"], {
      input: patch,
    });
  } else {
    if (!paths?.length) throw new Error("paths or patch is required.");
    await git(root, ["restore", "--staged", "--", ...paths]);
  }
  return computeStatus(root);
}

async function restore(
  cwd: string,
  target: "worktree" | "staged" | "both",
  paths?: string[],
  patch?: string,
) {
  const root = await requireRepo(cwd);
  if (patch) {
    const args = ["apply", "--reverse", "--whitespace=nowarn"];
    if (target === "staged") args.push("--cached");
    await git(root, args, { input: patch });
  } else {
    if (!paths?.length) throw new Error("paths or patch is required.");
    const restoreArgs = ["restore"];
    if (target === "staged" || target === "both") restoreArgs.push("--staged");
    if (target === "worktree" || target === "both") restoreArgs.push("--worktree");
    await git(root, [...restoreArgs, "--", ...paths]);
    const untracked = (
      await git(root, ["ls-files", "--others", "--exclude-standard", "--", ...paths])
    )
      .trim()
      .split("\n")
      .filter(Boolean);
    if (target !== "staged" && untracked.length > 0) {
      await git(root, ["clean", "-f", "--", ...untracked]);
    }
  }
  return computeStatus(root);
}

async function log(cwd: string, limit: number, path?: string) {
  const root = await requireRepo(cwd);
  const out = await git(root, [
    "log",
    `--max-count=${limit}`,
    "--date=iso-strict",
    "--format=%H%x00%h%x00%an%x00%ae%x00%ad%x00%s%x00%D",
    ...(path ? ["--", path] : []),
  ]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, shortHash, authorName, authorEmail, date, subject, refs] =
        line.split("\0");
      return { hash, shortHash, authorName, authorEmail, date, subject, refs };
    });
}

async function blame(cwd: string, path: string, startLine?: number, endLine?: number) {
  const root = await requireRepo(cwd);
  const range =
    startLine && endLine
      ? ["-L", `${startLine},${endLine}`]
      : startLine
        ? ["-L", `${startLine},${startLine}`]
        : [];
  const out = await git(root, ["blame", "--line-porcelain", ...range, "--", path]);
  const lines: Array<{
    line: number;
    hash: string;
    author: string;
    authorTime: number;
    summary: string;
    text: string;
  }> = [];
  let current: Partial<(typeof lines)[number]> = {};
  for (const line of out.split("\n")) {
    const header = line.match(/^([0-9a-f]{40}) \d+ (\d+)/);
    if (header) {
      current = { hash: header[1], line: Number.parseInt(header[2], 10) };
    } else if (line.startsWith("author ")) {
      current.author = line.slice("author ".length);
    } else if (line.startsWith("author-time ")) {
      current.authorTime = Number.parseInt(line.slice("author-time ".length), 10) || 0;
    } else if (line.startsWith("summary ")) {
      current.summary = line.slice("summary ".length);
    } else if (line.startsWith("\t")) {
      lines.push({
        line: current.line ?? 0,
        hash: current.hash ?? "",
        author: current.author ?? "",
        authorTime: current.authorTime ?? 0,
        summary: current.summary ?? "",
        text: line.slice(1),
      });
    }
  }
  return { path, lines };
}

async function worktreeAction(input: {
  cwd: string;
  action: "list" | "create" | "remove";
  path?: string;
  branch?: string;
  startPoint?: string;
  force: boolean;
  confirm: boolean;
}) {
  const root = await requireRepo(input.cwd);
  if (input.action === "create") {
    if (!input.path) throw new Error("Worktree path is required.");
    const args = ["worktree", "add"];
    if (input.branch) args.push("-b", input.branch);
    args.push(input.path);
    if (input.startPoint) args.push(input.startPoint);
    await git(root, args);
  } else if (input.action === "remove") {
    if (!input.path) throw new Error("Worktree path is required.");
    if (!input.confirm) throw new Error("confirm must be true to remove a worktree.");
    await git(root, [
      "worktree",
      "remove",
      ...(input.force ? ["--force"] : []),
      input.path,
    ]);
  }
  return parseWorktrees(await git(root, ["worktree", "list", "--porcelain"]));
}

function parseWorktrees(out: string) {
  const worktrees: Array<{
    path: string;
    head?: string;
    branch?: string;
    bare?: boolean;
    detached?: boolean;
  }> = [];
  let current: (typeof worktrees)[number] | null = null;
  for (const line of out.split("\n")) {
    if (!line) {
      if (current) worktrees.push(current);
      current = null;
      continue;
    }
    const [key, ...rest] = line.split(" ");
    const value = rest.join(" ");
    if (key === "worktree") current = { path: value };
    else if (current && key === "HEAD") current.head = value;
    else if (current && key === "branch")
      current.branch = value.replace(/^refs\/heads\//, "");
    else if (current && key === "bare") current.bare = true;
    else if (current && key === "detached") current.detached = true;
  }
  if (current) worktrees.push(current);
  return worktrees;
}

async function createCheckpoint(input: {
  cwd: string;
  label?: string;
  source?: string;
  sessionId?: string;
  toolCallId?: string;
}): Promise<GitCheckpointMeta> {
  const root = await requireRepo(input.cwd);
  const gitDir = (await git(root, ["rev-parse", "--git-dir"])).trim();
  const absoluteGitDir = gitDir.startsWith("/") ? gitDir : join(root, gitDir);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const ref = `${CHECKPOINT_REF_PREFIX}/${id}`;
  const indexPath = join(tmpdir(), `meith-checkpoint-${id}.index`);
  const baseHead = await headOrNull(root);
  const env = { GIT_INDEX_FILE: indexPath };

  try {
    if (baseHead) await git(root, ["read-tree", "HEAD"], { env });
    else await git(root, ["read-tree", "--empty"], { env });
    await git(root, ["add", "-A"], { env });
    const tree = (await git(root, ["write-tree"], { env })).trim();
    const message = input.label?.trim() || `Meith checkpoint ${id}`;
    const commitArgs = [
      "commit-tree",
      tree,
      ...(baseHead ? ["-p", baseHead] : []),
      "-m",
      message,
    ];
    const commit = (await git(root, commitArgs, { env })).trim();
    await git(root, ["update-ref", ref, commit]);
  } finally {
    if (existsSync(indexPath)) unlinkSync(indexPath);
  }

  const meta: GitCheckpointMeta = {
    id,
    ref,
    root,
    baseHead,
    createdAt: Date.now(),
    label: input.label,
    source: input.source,
    sessionId: input.sessionId,
    toolCallId: input.toolCallId,
  };
  const metadata = readCheckpointMetadata(absoluteGitDir).filter(
    (item) => item.id !== id,
  );
  metadata.unshift(meta);
  writeCheckpointMetadata(absoluteGitDir, metadata);
  return meta;
}

async function listCheckpoints(cwd: string): Promise<GitCheckpointMeta[]> {
  const root = await requireRepo(cwd);
  const gitDir = (await git(root, ["rev-parse", "--git-dir"])).trim();
  const absoluteGitDir = gitDir.startsWith("/") ? gitDir : join(root, gitDir);
  const metadata = readCheckpointMetadata(absoluteGitDir);
  const existing: GitCheckpointMeta[] = [];
  for (const item of metadata) {
    try {
      await git(root, ["rev-parse", "--verify", item.ref]);
      existing.push(item);
    } catch {
      // Drop stale metadata for refs that were manually removed.
    }
  }
  if (existing.length !== metadata.length)
    writeCheckpointMetadata(absoluteGitDir, existing);
  return existing;
}

async function restoreCheckpoint(cwd: string, id: string) {
  const root = await requireRepo(cwd);
  const checkpoint = (await listCheckpoints(root)).find((item) => item.id === id);
  if (!checkpoint) throw new Error(`Unknown checkpoint: ${id}`);
  await git(root, ["clean", "-fd"]);
  await git(root, ["read-tree", "--reset", "-u", checkpoint.ref]);
  const head = await headOrNull(root);
  if (head) await git(root, ["reset", "--mixed", "HEAD"]);
  return { checkpoint, status: await computeStatus(root) };
}

async function compareCheckpoints(
  cwd: string,
  left: string,
  right?: string,
  includePatch = false,
) {
  const root = await requireRepo(cwd);
  const leftRef = await checkpointRef(root, left);
  const rightRef = right ? await checkpointRef(root, right) : "HEAD";
  const stat = await git(root, ["diff", "--stat", leftRef, rightRef]);
  const numstat = await git(root, ["diff", "--numstat", leftRef, rightRef]);
  const patch = includePatch ? await git(root, ["diff", leftRef, rightRef]) : "";
  return {
    left: leftRef,
    right: rightRef,
    stat: stat.trim(),
    files: parseNumstat(numstat),
    patch,
  };
}

async function checkpointRef(root: string, idOrRef: string): Promise<string> {
  const checkpoint = (await listCheckpoints(root)).find((item) => item.id === idOrRef);
  const ref = checkpoint?.ref ?? idOrRef;
  await git(root, ["rev-parse", "--verify", ref]);
  return ref;
}

function parseNumstat(out: string) {
  return out
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [addRaw, delRaw, ...rest] = line.split("\t");
      const binary = addRaw === "-" || delRaw === "-";
      return {
        path: rest.join("\t"),
        additions: binary ? 0 : Number.parseInt(addRaw, 10) || 0,
        deletions: binary ? 0 : Number.parseInt(delRaw, 10) || 0,
        binary,
      };
    });
}

function readCheckpointMetadata(gitDir: string): GitCheckpointMeta[] {
  const path = checkpointMetadataPath(gitDir);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as GitCheckpointMeta[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCheckpointMetadata(gitDir: string, metadata: GitCheckpointMeta[]): void {
  const dir = join(gitDir, "meith");
  mkdirSync(dir, { recursive: true });
  writeFileSync(checkpointMetadataPath(gitDir), `${JSON.stringify(metadata, null, 2)}\n`);
}

function checkpointMetadataPath(gitDir: string): string {
  return join(gitDir, "meith", "checkpoints.json");
}

async function requireRepo(cwd: string): Promise<string> {
  const root = await repoRoot(cwd);
  if (!root) throw new Error("Not inside a git repository.");
  return root;
}

/** Split a multi-file unified diff into per-file sections keyed by new path. */
function splitPatch(patch: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!patch) return map;
  const sections = patch
    .split(/(?=^diff --git )/m)
    .filter((s) => s.startsWith("diff --git"));
  for (const section of sections) {
    const path = extractPath(section);
    if (path) map.set(path, `${section.replace(/\s+$/, "")}\n`);
  }
  return map;
}

/** Best-effort path for a single-file diff section. */
function extractPath(section: string): string | null {
  const plus = section.match(/^\+\+\+ b\/(.+)$/m);
  if (plus && plus[1] !== "/dev/null") return plus[1];
  const minus = section.match(/^--- a\/(.+)$/m);
  if (minus && minus[1] !== "/dev/null") return minus[1];
  const dg = section.match(/^diff --git a\/(.+?) b\/(.+)$/m);
  if (dg) return dg[2];
  return null;
}
