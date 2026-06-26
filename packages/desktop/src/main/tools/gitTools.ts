import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type ToolDefinition, defineTool } from "@meith/protocol";
import { okResult } from "@meith/shared";
import { z } from "zod";
import type { ToolDeps } from "./deps.js";

const pexec = promisify(execFile);

/** The well-known SHA of git's empty tree; used to diff repos with no commits. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
/** Generous buffer so large diffs aren't truncated by the default 1 MB cap. */
const MAX_BUFFER = 64 * 1024 * 1024;
const MAX_UNTRACKED_PATCH_BYTES = 512 * 1024;

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
  files: GitDiffFile[];
  totalAdditions: number;
  totalDeletions: number;
}

/**
 * Git inspection tools. `git_diff` reports the project's working-tree changes
 * (staged + unstaged vs HEAD, plus untracked files) as structured per-file
 * unified diffs. It's read-only and routed through the same registry every
 * caller uses, so the renderer's diff surface, the CLI, and agents share it.
 */
export function createGitTools(_deps: ToolDeps): ToolDefinition[] {
  const gitDiff = defineTool({
    name: "git_diff",
    description:
      "Summarize a project's working-tree changes (vs HEAD, including untracked files) as per-file unified diffs with +/- line counts.",
    capabilities: ["read-only"],
    inputSchema: z.object({
      cwd: z.string().min(1).describe("A path inside the git repository to inspect."),
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
    }),
    execute: async (_ctx, input) =>
      okResult(await computeDiff(input.cwd, input.includePatches !== false, input.path)),
  });

  return [gitDiff];
}

/** Run git, returning stdout. Throws on non-zero exit. */
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await pexec("git", args, { cwd, maxBuffer: MAX_BUFFER });
  return stdout;
}

async function computeDiff(
  cwd: string,
  includePatches: boolean,
  pathFilter?: string,
): Promise<GitDiffResult> {
  let root: string;
  try {
    root = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    // Not a git repository (or git missing): report an empty, non-repo result
    // rather than failing the tool — the UI renders an "untracked" empty state.
    return { isRepo: false, root: null, files: [], totalAdditions: 0, totalDeletions: 0 };
  }

  // Diff against HEAD normally, or the empty tree for a repo with no commits.
  let base = "HEAD";
  try {
    await git(root, ["rev-parse", "--verify", "HEAD"]);
  } catch {
    base = EMPTY_TREE;
  }

  const files: GitDiffFile[] = [];

  // --- Tracked changes (staged + unstaged) vs the base ---------------------
  const quote = ["-c", "core.quotepath=false", "-c", "color.ui=false"];
  const numstat = (await git(root, [...quote, "diff", base, "--numstat"])).trim();
  const nameStatus = (await git(root, [...quote, "diff", base, "--name-status"])).trim();
  const statusMap = parseNameStatus(nameStatus);
  const patchByPath = includePatches
    ? splitPatch(
        await git(
          root,
          pathFilter
            ? [...quote, "diff", base, "--", pathFilter]
            : [...quote, "diff", base],
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
  const untracked = (
    await git(root, ["ls-files", "--others", "--exclude-standard"])
  ).trim();
  if (untracked) {
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
  return { isRepo: true, root, files, totalAdditions, totalDeletions };
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
