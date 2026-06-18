import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HeadlessBrowserViewHost } from "../browser/HeadlessBrowserViewHost.js";
import { AppStateService } from "../services/AppStateService.js";
import { BrowserTabService } from "../services/BrowserTabService.js";
import { DevServerService } from "../services/DevServerService.js";
import { Logger } from "../services/Logger.js";
import { ProjectService } from "../services/ProjectService.js";
import { SpaceService } from "../services/SpaceService.js";
import {
  WorkspaceFileError,
  WorkspaceFileService,
  applyRangeEdits,
} from "../services/WorkspaceFileService.js";
import { createFileTools } from "../tools/fileTools.js";

/**
 * Build a WorkspaceFileService wired to a real ProjectService, plus a tmp
 * project root registered as a known workspace boundary.
 */
function makeCtx() {
  const dataDir = mkdtempSync(join(tmpdir(), "meith-files-"));
  const generatedRoot = join(dataDir, "projects");
  const appState = new AppStateService(join(dataDir, "state.json"), new Logger(), 0);
  const browserTabs = new BrowserTabService(appState, new Logger(), {
    host: new HeadlessBrowserViewHost(),
  });
  const devServers = new DevServerService(new Logger());
  const spaces = new SpaceService(appState, browserTabs, new Logger(), devServers);
  const projects = new ProjectService(
    appState,
    spaces,
    browserTabs,
    devServers,
    new Logger(),
    { generatedRoot, templatesDir: generatedRoot },
  );

  // A real project directory, opened so it becomes a known workspace root.
  const projectDir = mkdtempSync(join(tmpdir(), "meith-ws-"));
  writeFileSync(
    join(projectDir, "package.json"),
    JSON.stringify({ name: "ws", scripts: { dev: "vite" } }),
  );
  projects.open({ cwd: projectDir });

  const files = new WorkspaceFileService(projects, new Logger(), appState);
  return { dataDir, projectDir, appState, browserTabs, devServers, projects, files };
}

describe("applyRangeEdits", () => {
  it("applies non-overlapping edits right-to-left", () => {
    const out = applyRangeEdits("hello world", [
      { start: 0, end: 5, newText: "HELLO" },
      { start: 6, end: 11, newText: "WORLD" },
    ]);
    expect(out).toBe("HELLO WORLD");
  });

  it("rejects out-of-bounds ranges", () => {
    expect(() => applyRangeEdits("abc", [{ start: 0, end: 99, newText: "x" }])).toThrow(
      WorkspaceFileError,
    );
  });

  it("rejects overlapping edits", () => {
    expect(() =>
      applyRangeEdits("abcdef", [
        { start: 0, end: 3, newText: "x" },
        { start: 2, end: 4, newText: "y" },
      ]),
    ).toThrow(WorkspaceFileError);
  });
});

describe("WorkspaceFileService", () => {
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    ctx = makeCtx();
  });

  afterEach(() => {
    ctx.devServers.stopAll();
    rmSync(ctx.dataDir, { recursive: true, force: true });
    rmSync(ctx.projectDir, { recursive: true, force: true });
  });

  it("writes and reads a file inside the workspace", () => {
    const write = ctx.files.writeFile(ctx.projectDir, "src/app.ts", "const x = 1;\n");
    expect(write.created).toBe(true);
    expect(readFileSync(join(ctx.projectDir, "src/app.ts"), "utf8")).toBe(
      "const x = 1;\n",
    );

    const read = ctx.files.readFile(ctx.projectDir, "src/app.ts");
    expect(read.content).toBe("const x = 1;\n");
    expect(read.truncated).toBe(false);
  });

  it("rejects writes outside the workspace boundary unless allowOutside", () => {
    const outside = join(tmpdir(), `escape-${Date.now()}.txt`);
    expect(() => ctx.files.writeFile(ctx.projectDir, outside, "nope")).toThrow(
      WorkspaceFileError,
    );
    // With the explicit escape hatch it succeeds.
    const ok = ctx.files.writeFile(ctx.projectDir, outside, "ok", { allowOutside: true });
    expect(ok.created).toBe(true);
    rmSync(outside, { force: true });
  });

  it("blocks path traversal that escapes the root", () => {
    expect(() => ctx.files.readFile(ctx.projectDir, "../../etc/passwd")).toThrow(
      WorkspaceFileError,
    );
  });

  it("rejects an arbitrary caller-provided cwd that is not tracked", () => {
    const outsideDir = mkdtempSync(join(tmpdir(), "meith-untracked-"));
    writeFileSync(join(outsideDir, "secret.txt"), "secret");
    try {
      expect(() => ctx.files.readFile(outsideDir, "secret.txt")).toThrow(
        WorkspaceFileError,
      );
      const explicit = ctx.files.readFile(outsideDir, "secret.txt", {
        allowOutside: true,
      });
      expect(explicit.content).toBe("secret");
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("blocks reads/writes/patches through a symlink that escapes the workspace", () => {
    // A secret file living entirely outside any known workspace root.
    const outsideDir = mkdtempSync(join(tmpdir(), "meith-outside-"));
    const secret = join(outsideDir, "secret.txt");
    writeFileSync(secret, "top secret");
    // A symlink *inside* the workspace that points at the outside secret. A
    // purely lexical boundary check would treat "link.txt" as in-bounds.
    const link = join(ctx.projectDir, "link.txt");
    symlinkSync(secret, link);

    try {
      expect(() => ctx.files.readFile(ctx.projectDir, "link.txt")).toThrow(
        WorkspaceFileError,
      );
      expect(() => ctx.files.writeFile(ctx.projectDir, "link.txt", "pwned")).toThrow(
        WorkspaceFileError,
      );
      expect(() =>
        ctx.files.applyPatch(ctx.projectDir, "link.txt", [
          { start: 0, end: 0, newText: "x" },
        ]),
      ).toThrow(WorkspaceFileError);
      // The secret was never touched.
      expect(readFileSync(secret, "utf8")).toBe("top secret");
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("blocks creating new files through a symlinked directory that escapes", () => {
    // A directory outside the workspace, linked to from inside it.
    const outsideDir = mkdtempSync(join(tmpdir(), "meith-outdir-"));
    const linkDir = join(ctx.projectDir, "linked");
    symlinkSync(outsideDir, linkDir);

    try {
      // The nested file does not exist yet, but its parent dereferences outside.
      expect(() =>
        ctx.files.writeFile(ctx.projectDir, "linked/new.txt", "nope"),
      ).toThrow(WorkspaceFileError);
      expect(existsSync(join(outsideDir, "new.txt"))).toBe(false);
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("applies a structured patch and reports before/after", () => {
    ctx.files.writeFile(ctx.projectDir, "a.txt", "hello world");
    const res = ctx.files.applyPatch(ctx.projectDir, "a.txt", [
      { start: 0, end: 5, newText: "goodbye" },
    ]);
    expect(res.before).toBe("hello world");
    expect(res.after).toBe("goodbye world");
    expect(res.edits).toBe(1);
  });

  it("captures undo metadata and reverts the last write", () => {
    ctx.files.writeFile(ctx.projectDir, "u.txt", "v1");
    ctx.files.writeFile(ctx.projectDir, "u.txt", "v2");
    expect(ctx.files.undoDepthFor(ctx.projectDir, "u.txt")).toBe(2);

    const entry = ctx.files.undoLast(ctx.projectDir, "u.txt");
    expect(entry?.previousContent).toBe("v1");
    expect(readFileSync(join(ctx.projectDir, "u.txt"), "utf8")).toBe("v1");
  });

  it("undo deletes files that were newly created", () => {
    ctx.files.writeFile(ctx.projectDir, "created.txt", "temporary");
    expect(existsSync(join(ctx.projectDir, "created.txt"))).toBe(true);

    const entry = ctx.files.undoLast(ctx.projectDir, "created.txt");
    expect(entry?.previousContent).toBeNull();
    expect(existsSync(join(ctx.projectDir, "created.txt"))).toBe(false);
  });

  it("lists files recursively, skipping ignored directories", () => {
    ctx.files.writeFile(ctx.projectDir, "src/index.ts", "x");
    ctx.files.writeFile(ctx.projectDir, "node_modules/dep/index.js", "y");
    const { entries } = ctx.files.listFiles(ctx.projectDir, { recursive: true });
    const paths = entries.map((e) => e.path);
    expect(paths).toContain("src/index.ts");
    expect(paths.some((p) => p.includes("node_modules"))).toBe(false);
  });

  it("searches file contents and returns line/column matches", () => {
    ctx.files.writeFile(ctx.projectDir, "a.ts", "const foo = 1;\nconst bar = foo;\n");
    const { matches } = ctx.files.search(ctx.projectDir, { query: "foo" });
    expect(matches.length).toBe(2);
    expect(matches[0]).toMatchObject({ path: "a.ts", line: 1 });
  });

  it("returns unsupported diagnostics for non-TS/JS files", () => {
    ctx.files.writeFile(ctx.projectDir, "notes.md", "# hi");
    const diag = ctx.files.getDiagnostics(ctx.projectDir, "notes.md");
    expect(diag.unsupported).toBe(true);
    expect(diag.diagnostics).toEqual([]);
  });

  it("produces real TypeScript diagnostics for a type error", () => {
    ctx.files.writeFile(ctx.projectDir, "bad.ts", "const n: number = 'string';\n");
    const diag = ctx.files.getDiagnostics(ctx.projectDir, "bad.ts");
    expect(diag.unsupported).toBe(false);
    expect(diag.diagnostics.length).toBeGreaterThan(0);
    expect(diag.diagnostics[0].severity).toBe("error");
  });
});

describe("file tools", () => {
  const ctxArg = { cwd: process.cwd(), caller: "internal" as const };
  const unwrap = <T>(r: unknown): T => (r as { content: T }).content;

  function makeTools() {
    const base = makeCtx();
    const deps = { files: base.files } as unknown as Parameters<
      typeof createFileTools
    >[0];
    const tools = Object.fromEntries(createFileTools(deps).map((t) => [t.name, t]));
    return { ...base, tools };
  }

  it("registers the Phase 8 file tool surface", () => {
    const { tools, devServers, dataDir, projectDir } = makeTools();
    for (const name of [
      "workspace_read_file",
      "workspace_write_file",
      "workspace_apply_patch",
      "workspace_undo",
      "workspace_list_files",
      "workspace_search",
      "get_diagnostics",
    ]) {
      expect(tools[name], `missing tool ${name}`).toBeTruthy();
    }
    devServers.stopAll();
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("round-trips write -> read through the tools", async () => {
    const { tools, devServers, dataDir, projectDir } = makeTools();
    await tools.workspace_write_file.execute(ctxArg, {
      cwd: projectDir,
      path: "hi.txt",
      content: "tool wrote this",
    });
    const read = await tools.workspace_read_file.execute(ctxArg, {
      cwd: projectDir,
      path: "hi.txt",
    });
    expect(unwrap<{ content: string }>(read).content).toBe("tool wrote this");
    devServers.stopAll();
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("maps a boundary violation to a VALIDATION_ERROR ToolError", async () => {
    const { tools, devServers, dataDir, projectDir } = makeTools();
    let code: string | undefined;
    try {
      await tools.workspace_read_file.execute(ctxArg, {
        cwd: projectDir,
        path: "../../../etc/hosts",
      });
    } catch (err) {
      code = (err as { code?: string }).code;
    }
    expect(code).toBe("VALIDATION_ERROR");
    devServers.stopAll();
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("confines agent file tools to the session cwd, not caller-supplied cwd", async () => {
    const { tools, projects, devServers, dataDir, projectDir } = makeTools();
    const otherDir = mkdtempSync(join(tmpdir(), "meith-other-ws-"));
    writeFileSync(join(otherDir, "package.json"), JSON.stringify({ name: "other" }));
    writeFileSync(join(otherDir, "secret.txt"), "not this session");
    projects.open({ cwd: otherDir });

    let code: string | undefined;
    try {
      await tools.workspace_read_file.execute(
        { cwd: projectDir, caller: "agent" as const },
        {
          cwd: otherDir,
          path: join(otherDir, "secret.txt"),
          allowOutside: true,
        },
      );
    } catch (err) {
      code = (err as { code?: string }).code;
    }

    expect(code).toBe("VALIDATION_ERROR");
    devServers.stopAll();
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(otherDir, { recursive: true, force: true });
  });
});
