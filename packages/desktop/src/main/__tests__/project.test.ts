import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeadlessBrowserViewHost } from "../browser/HeadlessBrowserViewHost.js";
import { AppStateService } from "../services/AppStateService.js";
import { BrowserTabService } from "../services/BrowserTabService.js";
import { DevServerService } from "../services/DevServerService.js";
import { Logger } from "../services/Logger.js";
import { ProjectError, ProjectService } from "../services/ProjectService.js";
import { SpaceService } from "../services/SpaceService.js";
import { createProjectTools } from "../tools/projectTools.js";

/** The templates/ directory at the meith repo root. */
const TEMPLATES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../templates",
);

function makeCtx() {
  const dataDir = mkdtempSync(join(tmpdir(), "meith-proj-"));
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
    { generatedRoot, templatesDir: TEMPLATES_DIR },
  );
  return { dataDir, generatedRoot, appState, browserTabs, devServers, spaces, projects };
}

describe("ProjectService", () => {
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    ctx = makeCtx();
  });

  afterEach(() => {
    ctx.devServers.stopAll();
    rmSync(ctx.dataDir, { recursive: true, force: true });
  });

  it("detects package manager, framework, and scripts from a directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-detect-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "demo",
        dependencies: { next: "15.0.0", react: "19.0.0" },
        scripts: { dev: "next dev", build: "next build" },
      }),
    );
    writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9.0\n");

    const detection = ctx.projects.detect(dir);
    expect(detection.name).toBe("demo");
    expect(detection.packageManager).toBe("pnpm");
    expect(detection.framework).toBe("nextjs");
    expect(detection.scripts.map((s) => s.name)).toEqual(["dev", "build"]);

    rmSync(dir, { recursive: true, force: true });
  });

  it("throws a ProjectError when detecting a missing directory", () => {
    expect(() => ctx.projects.detect("/definitely/not/here/xyz")).toThrow(ProjectError);
  });

  it("opens a project, records it, and creates an editor workspace tab", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-open-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "openme", scripts: { dev: "vite" } }),
    );

    const { project, space, workspaceTab } = ctx.projects.open({ cwd: dir });
    expect(project.id).toMatch(/^proj_/);
    expect(project.name).toBe("openme");
    expect(project.workspaceTabIds).toContain(workspaceTab.id);
    expect(workspaceTab.kind).toBe("editor");
    // The workspace tab is anchored to the project root so space-aware tabs
    // (e.g. terminals) launch inside the project's directory.
    expect(workspaceTab.cwd).toBe(project.cwd);

    // A dedicated space was created (1:1), named after the project, active, and
    // bidirectionally linked to the project.
    expect(space.name).toBe("openme");
    expect(space.projectId).toBe(project.id);
    expect(project.spaceId).toBe(space.id);
    expect(ctx.appState.getState().activeSpaceId).toBe(space.id);
    expect(workspaceTab.spaceId).toBe(space.id);

    // Persisted in app state.
    expect(ctx.appState.getState().projects.some((p) => p.id === project.id)).toBe(true);
    // The workspace tab is real and tracked by BrowserTabService.
    expect(
      ctx.appState.getState().workspaceTabs.some((t) => t.id === workspaceTab.id),
    ).toBe(true);

    rmSync(dir, { recursive: true, force: true });
  });

  it("reuses the project's space when re-opened, and closing the space removes the project", async () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-reopen-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "reopen" }));

    const first = ctx.projects.open({ cwd: dir });
    const second = ctx.projects.open({ cwd: dir });
    // Same project => same space (no proliferation of spaces).
    expect(second.space.id).toBe(first.space.id);
    expect(ctx.appState.getState().spaces).toHaveLength(1);

    // Need a second space so the last-space guard allows closing the first.
    ctx.spaces.create({ name: "scratch" });
    await ctx.spaces.close(first.space.id);
    // The hosted project record is gone with its space.
    expect(ctx.projects.get(first.project.id)).toBeUndefined();

    rmSync(dir, { recursive: true, force: true });
  });

  it("dedupes by cwd: re-opening updates the same record", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-dedupe-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "dup" }));

    const first = ctx.projects.open({ cwd: dir }).project;
    const second = ctx.projects.open({ cwd: dir }).project;
    expect(second.id).toBe(first.id);
    expect(ctx.projects.list()).toHaveLength(1);
    expect(second.lastOpenedAt).toBeGreaterThanOrEqual(first.lastOpenedAt);
    // Both workspace tabs are associated with the single project.
    expect(second.workspaceTabIds.length).toBe(2);

    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects opening a different project into an occupied space", () => {
    const firstDir = mkdtempSync(join(tmpdir(), "meith-first-"));
    const secondDir = mkdtempSync(join(tmpdir(), "meith-second-"));
    writeFileSync(join(firstDir, "package.json"), JSON.stringify({ name: "first" }));
    writeFileSync(join(secondDir, "package.json"), JSON.stringify({ name: "second" }));

    const first = ctx.projects.open({ cwd: firstDir });
    expect(() => ctx.projects.open({ cwd: secondDir, spaceId: first.space.id })).toThrow(
      ProjectError,
    );

    const state = ctx.appState.getState();
    expect(state.projects).toHaveLength(1);
    expect(state.projects.filter((p) => p.spaceId === first.space.id)).toHaveLength(1);
    expect(ctx.spaces.get(first.space.id)?.projectId).toBe(first.project.id);

    rmSync(firstDir, { recursive: true, force: true });
    rmSync(secondDir, { recursive: true, force: true });
  });

  it("starts a project's dev server using its package manager + dev script", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-dev-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "srv", scripts: { dev: "node server.mjs" } }),
    );
    writeFileSync(join(dir, "yarn.lock"), "");

    const project = ctx.projects.open({ cwd: dir }).project;
    // Spy on the real DevServerService so no process is actually spawned.
    const spy = vi
      .spyOn(ctx.devServers, "start")
      .mockReturnValue({ id: "dev_fake" } as never);

    ctx.projects.startDevServer(project.id);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: dir,
        command: "yarn",
        args: ["dev"],
      }),
    );
    spy.mockRestore();

    rmSync(dir, { recursive: true, force: true });
  });

  it("throws when starting a dev server for a project with no scripts", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-noscript-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "empty" }));
    const project = ctx.projects.open({ cwd: dir }).project;
    expect(() => ctx.projects.startDevServer(project.id)).toThrow(ProjectError);
    rmSync(dir, { recursive: true, force: true });
  });

  it("persists a run configuration on the project record", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-runcfg-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "cfg" }));
    const project = ctx.projects.open({ cwd: dir }).project;
    const updated = ctx.projects.setRunConfig(project.id, {
      commands: [{ id: "run_1", label: "Dev", command: "pnpm dev", isDevServer: true }],
      defaultCommandId: "run_1",
      env: { NODE_ENV: "development" },
    });
    expect(updated.runConfig.commands).toHaveLength(1);
    expect(updated.runConfig.defaultCommandId).toBe("run_1");
    // The change is reflected in the live AppState.
    expect(ctx.projects.get(project.id)?.runConfig.env.NODE_ENV).toBe("development");
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs a custom configured command as a single shell string", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-run-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "run" }));
    const project = ctx.projects.open({ cwd: dir }).project;
    ctx.projects.setRunConfig(project.id, {
      commands: [
        { id: "run_1", label: "Serve", command: "make serve", isDevServer: true },
      ],
      defaultCommandId: "run_1",
      env: { PORT: "4000" },
    });
    const spy = vi
      .spyOn(ctx.devServers, "start")
      .mockReturnValue({ id: "dev_fake" } as never);
    ctx.projects.runCommand(project.id);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: dir,
        command: "make serve",
        shell: true,
        env: { PORT: "4000" },
      }),
    );
    spy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to the detected dev script when no custom command exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-run-fallback-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "fb", scripts: { dev: "node server.mjs" } }),
    );
    writeFileSync(join(dir, "yarn.lock"), "");
    const project = ctx.projects.open({ cwd: dir }).project;
    const spy = vi
      .spyOn(ctx.devServers, "start")
      .mockReturnValue({ id: "dev_fake" } as never);
    ctx.projects.runCommand(project.id);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: dir, command: "yarn", args: ["dev"] }),
    );
    spy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws when running an unknown command id", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-run-unknown-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "u" }));
    const project = ctx.projects.open({ cwd: dir }).project;
    expect(() => ctx.projects.runCommand(project.id, "nope")).toThrow(ProjectError);
    rmSync(dir, { recursive: true, force: true });
  });

  it("lists the app and plugin templates from disk", () => {
    const templates = ctx.projects.listTemplates();
    const byName = Object.fromEntries(templates.map((t) => [t.name, t]));
    expect(byName["app-basic"]?.kind).toBe("app");
    expect(byName["plugin-basic"]?.kind).toBe("plugin");
  });

  it("creates a project from a template and opens it", () => {
    const result = ctx.projects.createFromTemplate({
      template: "app-basic",
      name: "My New App",
    });
    expect(result.project).not.toBeNull();
    expect(result.cwd).toContain("my-new-app");
    // Real files were copied.
    expect(existsSync(join(result.cwd, "package.json"))).toBe(true);
    expect(existsSync(join(result.cwd, "server.mjs"))).toBe(true);
    expect(result.project?.kind).toBe("app");
    expect(result.project?.name).toBe("my-new-app");
    expect(result.space?.name).toBe("my-new-app");
    expect(JSON.parse(readFileSync(join(result.cwd, "package.json"), "utf8")).name).toBe(
      "my-new-app",
    );
  });

  it("creates a plugin project from the plugin template", () => {
    const result = ctx.projects.createPlugin({ name: "my-plugin" });
    expect(result.project?.kind).toBe("plugin");
    expect(existsSync(join(result.cwd, "src", "index.ts"))).toBe(true);
  });

  it("avoids destination collisions when generating projects", () => {
    const a = ctx.projects.createFromTemplate({ template: "app-basic", name: "same" });
    const b = ctx.projects.createFromTemplate({ template: "app-basic", name: "same" });
    expect(a.cwd).not.toBe(b.cwd);
  });

  it("prewarms and allocates ready app projects from the buffer", () => {
    const { ready } = ctx.projects.prewarm(2);
    expect(ready).toBe(2);
    expect(ctx.projects.prewarmStatus().ready).toBe(2);

    const allocated = ctx.projects.allocatePrewarmed({
      name: "instant",
      startDevServer: false,
    });
    expect(allocated.fromBuffer).toBe(true);
    expect(existsSync(join(allocated.cwd, "package.json"))).toBe(true);
    // One slot was consumed.
    expect(ctx.projects.prewarmStatus().ready).toBe(1);
  });

  it("allocates a fresh project when the prewarm buffer is empty", () => {
    const allocated = ctx.projects.allocatePrewarmed({ startDevServer: false });
    expect(allocated.fromBuffer).toBe(false);
    expect(allocated.project.id).toMatch(/^proj_/);
  });
});

describe("project tools", () => {
  const ctxArg = { cwd: process.cwd(), caller: "internal" as const };
  const unwrap = <T>(r: unknown): T => (r as { content: T }).content;

  function makeTools() {
    const base = makeCtx();
    const deps = {
      projects: base.projects,
    } as unknown as Parameters<typeof createProjectTools>[0];
    const tools = Object.fromEntries(createProjectTools(deps).map((t) => [t.name, t]));
    return { ...base, tools };
  }

  it("registers the Phase 7 project tool surface", () => {
    const { tools, devServers, dataDir } = makeTools();
    for (const name of [
      "project_list",
      "project_detect",
      "project_open",
      "project_start_dev_server",
      "project_stop_dev_server",
      "project_run",
      "project_set_run_config",
      "project_list_templates",
      "project_create",
      "project_create_plugin",
      "project_prewarm",
      "project_prewarm_status",
      "project_allocate",
    ]) {
      expect(tools[name], `missing tool ${name}`).toBeTruthy();
    }
    devServers.stopAll();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("maps a ProjectError to a TOOL_FAILED ToolError", async () => {
    const { tools, devServers, dataDir } = makeTools();
    let code: string | undefined;
    try {
      await tools.project_detect.execute(ctxArg, { cwd: "/no/such/dir/zzz" });
    } catch (err) {
      code = (err as { code?: string }).code;
    }
    expect(code).toBe("TOOL_FAILED");
    devServers.stopAll();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("creates a template-backed project through the tool", async () => {
    const { tools, devServers, dataDir } = makeTools();
    const result = await tools.project_create.execute(ctxArg, {
      template: "app-basic",
      name: "tooled",
      open: false,
    });
    const created = unwrap<{ cwd: string }>(result);
    expect(created.cwd).toContain("tooled");
    devServers.stopAll();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("registers project_setup_detect and project_retry_dev_server tools", () => {
    const { tools, devServers, dataDir } = makeTools();
    expect(tools["project_setup_detect"], "missing project_setup_detect").toBeTruthy();
    expect(
      tools["project_retry_dev_server"],
      "missing project_retry_dev_server",
    ).toBeTruthy();
    devServers.stopAll();
    rmSync(dataDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// ProjectService.setupDetect
// ---------------------------------------------------------------------------

describe("ProjectService.setupDetect", () => {
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    ctx = makeCtx();
  });

  afterEach(() => {
    ctx.devServers.stopAll();
    rmSync(ctx.dataDir, { recursive: true, force: true });
  });

  it("returns all base detection fields plus setup-specific fields", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-setup-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "setup-test",
        dependencies: { next: "15.0.0" },
        scripts: { dev: "next dev", build: "next build" },
      }),
    );
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");

    const result = ctx.projects.setupDetect(dir);

    expect(result.name).toBe("setup-test");
    expect(result.framework).toBe("nextjs");
    expect(result.packageManager).toBe("pnpm");
    expect(result.hasPackageJson).toBe(true);
    expect(result.scripts.map((s) => s.name)).toContain("dev");
    expect(result.envFiles).toBeInstanceOf(Array);
    expect(result.isMonorepo).toBe(false);
    expect(result.workspaces).toEqual([]);
    expect(result.likelyPort).toBe(3000);
    expect(typeof result.setupNotes).toBe("string");
    expect(result.setupNotes).toContain("setup-test");
    expect(result.setupNotes).toContain("nextjs");
    expect(result.setupNotes).toContain("3000");

    rmSync(dir, { recursive: true, force: true });
  });

  it("detects .env files in the project root", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-env-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "envtest" }));
    writeFileSync(join(dir, ".env"), "FOO=bar");
    writeFileSync(join(dir, ".env.local"), "SECRET=xyz");

    const result = ctx.projects.setupDetect(dir);
    expect(result.envFiles).toContain(".env");
    expect(result.envFiles).toContain(".env.local");
    expect(result.setupNotes).toContain(".env");

    rmSync(dir, { recursive: true, force: true });
  });

  it("reports no env files when none exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-noenv-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "noenv" }));

    const result = ctx.projects.setupDetect(dir);
    expect(result.envFiles).toEqual([]);
    expect(result.setupNotes).toContain("No .env files found");

    rmSync(dir, { recursive: true, force: true });
  });

  it("detects a pnpm monorepo and enumerates workspace packages", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-mono-"));
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "monorepo-root" }));
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    writeFileSync(
      join(dir, "pnpm-workspace.yaml"),
      "packages:\n  - 'packages/*'\n",
    );
    const pkgDir = join(dir, "packages", "web");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify({
        name: "@mono/web",
        dependencies: { next: "15.0.0" },
        scripts: { dev: "next dev" },
      }),
    );

    const result = ctx.projects.setupDetect(dir);
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaces).toHaveLength(1);
    expect(result.workspaces[0].name).toBe("@mono/web");
    expect(result.workspaces[0].dir).toBe(join("packages", "web"));
    expect(result.workspaces[0].framework).toBe("nextjs");
    expect(result.setupNotes).toContain("Monorepo: yes");
    expect(result.setupNotes).toContain("@mono/web");

    rmSync(dir, { recursive: true, force: true });
  });

  it("extracts a port from a --port flag in the dev script", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-port-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "custom-port",
        scripts: { dev: "vite --port 4200" },
      }),
    );

    const result = ctx.projects.setupDetect(dir);
    expect(result.likelyPort).toBe(4200);
    expect(result.setupNotes).toContain("4200");

    rmSync(dir, { recursive: true, force: true });
  });

  it("falls back to framework default port when no --port flag is present", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-defaultport-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "astro-app",
        dependencies: { astro: "4.0.0" },
        scripts: { dev: "astro dev" },
      }),
    );

    const result = ctx.projects.setupDetect(dir);
    expect(result.likelyPort).toBe(4321);

    rmSync(dir, { recursive: true, force: true });
  });

  it("throws a ProjectError for a missing directory", () => {
    expect(() => ctx.projects.setupDetect("/definitely/missing/xyz")).toThrow(
      ProjectError,
    );
  });
});

// ---------------------------------------------------------------------------
// ProjectService.retryDevServer
// ---------------------------------------------------------------------------

describe("ProjectService.retryDevServer", () => {
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    ctx = makeCtx();
  });

  afterEach(() => {
    ctx.devServers.stopAll();
    rmSync(ctx.dataDir, { recursive: true, force: true });
  });

  it("stops the existing errored server and starts a fresh one, returning the log tail", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-retry-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "retry-app", scripts: { dev: "node server.mjs" } }),
    );
    writeFileSync(join(dir, "yarn.lock"), "");
    const project = ctx.projects.open({ cwd: dir }).project;

    const fakeErroredServer = {
      id: "dev_errored",
      cwd: dir,
      status: "errored" as const,
      command: "yarn",
      args: ["dev"],
      startedAt: Date.now() - 5000,
      pid: null,
      port: null,
      exitCode: 1,
      signal: null,
      name: "retry-app:dev",
    };
    const fakeNewServer = { id: "dev_fresh", cwd: dir, status: "starting" as const } as never;

    // findByCwd is called twice inside retryDevServer: once for candidates, once for
    // "stop all before restart". Both times it should return the errored server.
    const findSpy = vi
      .spyOn(ctx.devServers, "findByCwd")
      .mockReturnValue([fakeErroredServer]);
    const stopSpy = vi.spyOn(ctx.devServers, "stop").mockReturnValue(true);
    const logSpy = vi
      .spyOn(ctx.devServers, "getLogs")
      .mockReturnValue([{ seq: 0, stream: "stderr", text: "error: port in use", ts: Date.now() }]);
    // start() is called exactly once (for the fresh server) because open() was called
    // before the mocks were applied.
    const startSpy = vi.spyOn(ctx.devServers, "start").mockReturnValue(fakeNewServer);

    const result = ctx.projects.retryDevServer(project.id, { logTailLines: 10 });

    expect(stopSpy).toHaveBeenCalledWith("dev_errored");
    expect(logSpy).toHaveBeenCalledWith("dev_errored", 10);
    expect(result.previousLogsTail).toHaveLength(1);
    expect(result.previousLogsTail[0].text).toContain("error: port in use");
    expect(result.devServer.id).toBe("dev_fresh");

    startSpy.mockRestore();
    findSpy.mockRestore();
    stopSpy.mockRestore();
    logSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it("starts a fresh server and returns an empty tail when no previous server exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-retry-fresh-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "fresh-retry", scripts: { dev: "node s.mjs" } }),
    );
    const project = ctx.projects.open({ cwd: dir }).project;

    const fakeServer = { id: "dev_new", cwd: dir, status: "starting" as const } as never;
    const spy = vi.spyOn(ctx.devServers, "start").mockReturnValue(fakeServer);
    const findSpy = vi.spyOn(ctx.devServers, "findByCwd").mockReturnValue([]);

    const result = ctx.projects.retryDevServer(project.id);
    expect(result.previousLogsTail).toEqual([]);
    expect(result.devServer.id).toBe("dev_new");

    spy.mockRestore();
    findSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws a ProjectError for an unknown projectId", () => {
    expect(() => ctx.projects.retryDevServer("proj_unknown")).toThrow(ProjectError);
  });
});
