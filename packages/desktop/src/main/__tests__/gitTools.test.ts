import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type GitDiffResult, createGitTools } from "../tools/gitTools.js";

describe("git tools", () => {
  const ctxArg = { cwd: process.cwd(), caller: "internal" as const };
  const unwrap = <T>(r: unknown): T => (r as { content: T }).content;

  function makeTools(gitSettings?: {
    activeIdentityProfileId: string | null;
    identityProfiles: Array<{ id: string; label: string; name: string; email: string }>;
  }) {
    return Object.fromEntries(
      createGitTools(
        gitSettings
          ? ({
              appState: {
                getState: () => ({
                  settings: {
                    git: gitSettings,
                  },
                }),
              },
            } as never)
          : ({} as never),
      ).map((tool) => [tool.name, tool]),
    );
  }

  function initRepo(repo: string) {
    execFileSync("git", ["init"], { cwd: repo, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: repo,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test User"], {
      cwd: repo,
      stdio: "ignore",
    });
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

  it("reports staged, unstaged, and untracked status sections", async () => {
    const repo = mkdtempSync(join(tmpdir(), "meith-git-"));
    try {
      initRepo(repo);
      writeFileSync(join(repo, "staged.txt"), "one\n");
      writeFileSync(join(repo, "dirty.txt"), "before\n");
      execFileSync("git", ["add", "dirty.txt"], { cwd: repo, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", "initial"], { cwd: repo, stdio: "ignore" });
      writeFileSync(join(repo, "dirty.txt"), "after\n");
      execFileSync("git", ["add", "staged.txt"], { cwd: repo, stdio: "ignore" });
      writeFileSync(join(repo, "new.txt"), "new\n");

      const tools = makeTools();
      const status = unwrap<{
        staged: Array<{ path: string }>;
        unstaged: Array<{ path: string }>;
        untracked: Array<{ path: string }>;
      }>(await tools.git_status.execute(ctxArg, { cwd: repo }));

      expect(status.staged.map((file) => file.path)).toEqual(["staged.txt"]);
      expect(status.unstaged.map((file) => file.path)).toEqual(["dirty.txt"]);
      expect(status.untracked.map((file) => file.path)).toEqual(["new.txt"]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("uses the active identity profile for commits", async () => {
    const repo = mkdtempSync(join(tmpdir(), "meith-git-"));
    try {
      initRepo(repo);
      writeFileSync(join(repo, "tracked.txt"), "base\n");
      execFileSync("git", ["add", "tracked.txt"], { cwd: repo, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", "initial"], { cwd: repo, stdio: "ignore" });

      writeFileSync(join(repo, "tracked.txt"), "next\n");
      execFileSync("git", ["add", "tracked.txt"], { cwd: repo, stdio: "ignore" });

      const tools = makeTools({
        activeIdentityProfileId: "gitacct_work",
        identityProfiles: [
          {
            id: "gitacct_work",
            label: "Work",
            name: "Work User",
            email: "work@example.com",
          },
        ],
      });
      await tools.git_commit.execute(ctxArg, {
        cwd: repo,
        message: "use work account",
      });

      const log = execFileSync(
        "git",
        ["log", "-1", "--format=%an%x00%ae%x00%cn%x00%ce"],
        { cwd: repo, encoding: "utf8" },
      )
        .trim()
        .split("\0");
      expect(log).toEqual([
        "Work User",
        "work@example.com",
        "Work User",
        "work@example.com",
      ]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("detects the current repository commit identity", async () => {
    const repo = mkdtempSync(join(tmpdir(), "meith-git-"));
    try {
      initRepo(repo);
      execFileSync("git", ["config", "user.name", "Repo User"], {
        cwd: repo,
        stdio: "ignore",
      });
      execFileSync("git", ["config", "user.email", "repo@example.com"], {
        cwd: repo,
        stdio: "ignore",
      });

      const tools = makeTools();
      const detected = unwrap<{
        root: string | null;
        suggestions: Array<{ source: string; name: string; email: string }>;
      }>(await tools.git_identity_detect.execute(ctxArg, { cwd: repo }));

      expect(detected.root).toBe(realpathSync(repo));
      expect(detected.suggestions).toContainEqual(
        expect.objectContaining({
          source: "repo",
          name: "Repo User",
          email: "repo@example.com",
        }),
      );
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("creates and restores a checkpoint without moving HEAD", async () => {
    const repo = mkdtempSync(join(tmpdir(), "meith-git-"));
    try {
      initRepo(repo);
      writeFileSync(join(repo, "tracked.txt"), "base\n");
      execFileSync("git", ["add", "tracked.txt"], { cwd: repo, stdio: "ignore" });
      execFileSync("git", ["commit", "-m", "initial"], { cwd: repo, stdio: "ignore" });
      const head = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repo,
        encoding: "utf8",
      }).trim();

      writeFileSync(join(repo, "tracked.txt"), "checkpoint\n");
      writeFileSync(join(repo, "new.txt"), "captured\n");

      const tools = makeTools();
      const checkpoint = unwrap<{ id: string }>(
        await tools.git_checkpoint_create.execute(ctxArg, {
          cwd: repo,
          label: "before run",
          sessionId: "sess_1",
        }),
      );

      writeFileSync(join(repo, "tracked.txt"), "after\n");
      writeFileSync(join(repo, "new.txt"), "after\n");
      writeFileSync(join(repo, "extra.txt"), "remove me\n");

      await tools.git_checkpoint_restore.execute(ctxArg, {
        cwd: repo,
        id: checkpoint.id,
        confirm: true,
      });

      const currentHead = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repo,
        encoding: "utf8",
      }).trim();
      expect(currentHead).toBe(head);
      expect(readFileSync(join(repo, "tracked.txt"), "utf8")).toBe("checkpoint\n");
      expect(readFileSync(join(repo, "new.txt"), "utf8")).toBe("captured\n");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
