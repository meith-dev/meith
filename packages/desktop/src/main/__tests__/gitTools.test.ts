import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type GitDiffResult, createGitTools } from "../tools/gitTools.js";

describe("git tools", () => {
  const ctxArg = { cwd: process.cwd(), caller: "internal" as const };
  const unwrap = <T>(r: unknown): T => (r as { content: T }).content;

  function makeTools() {
    return Object.fromEntries(
      createGitTools({} as never).map((tool) => [tool.name, tool]),
    );
  }

  it("counts untracked file additions in summary mode", async () => {
    const repo = mkdtempSync(join(tmpdir(), "meith-git-"));
    try {
      execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
      writeFileSync(join(repo, "new.txt"), "one\ntwo\nthree\n");

      const tools = makeTools();
      const diff = unwrap<GitDiffResult>(
        await tools.git_diff.execute(ctxArg, {
          cwd: repo,
          includePatches: false,
        }),
      );

      expect(diff.files).toHaveLength(1);
      expect(diff.files[0]).toMatchObject({
        path: "new.txt",
        status: "untracked",
        additions: 3,
        deletions: 0,
        binary: false,
        diff: "",
      });
      expect(diff.totalAdditions).toBe(3);
      expect(diff.totalDeletions).toBe(0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("keeps full untracked counts when patch preview is size-limited", async () => {
    const repo = mkdtempSync(join(tmpdir(), "meith-git-"));
    try {
      execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
      const lineCount = 250_000;
      writeFileSync(join(repo, "large.txt"), "x\n".repeat(lineCount));

      const tools = makeTools();
      const diff = unwrap<GitDiffResult>(
        await tools.git_diff.execute(ctxArg, {
          cwd: repo,
          includePatches: true,
        }),
      );

      expect(diff.files).toHaveLength(1);
      expect(diff.files[0]).toMatchObject({
        path: "large.txt",
        status: "untracked",
        additions: lineCount,
        deletions: 0,
        binary: false,
      });
      expect(diff.files[0].diff).toContain("Large untracked file omitted from preview");
      expect(diff.totalAdditions).toBe(lineCount);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
