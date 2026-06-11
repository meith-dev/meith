import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import {
  type DevServer,
  type PackageManager,
  type Project,
  type ProjectFramework,
  type ProjectKind,
  type ProjectScript,
  type Space,
  type WorkspaceTab,
  newProjectId,
} from "@meith/shared";
import type { AppStateService } from "./AppStateService.js";
import type { BrowserTabService } from "./BrowserTabService.js";
import type { DevServerService } from "./DevServerService.js";
import type { Logger } from "./Logger.js";
import type { SpaceService } from "./SpaceService.js";

/** Result of inspecting a directory without persisting a project record. */
export interface ProjectDetection {
  name: string;
  framework: ProjectFramework;
  packageManager: PackageManager;
  scripts: ProjectScript[];
  /** True when a package.json was found and parsed. */
  hasPackageJson: boolean;
}

/** Static information about an available project template. */
export interface TemplateInfo {
  name: string;
  kind: ProjectKind;
  description: string;
  path: string;
}

export interface ProjectServiceOptions {
  /** Root directory under which generated projects are created. */
  generatedRoot: string;
  /** Directory containing the project templates (templates/app-basic, ...). */
  templatesDir: string;
}

/** The combined result of opening a project into its (1:1) space. */
export interface OpenProjectResult {
  project: Project;
  space: Space;
  workspaceTab: WorkspaceTab;
  devServer: DevServer | null;
}

/** A descriptive `Error` whose message tools surface as a `TOOL_FAILED`. */
export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectError";
  }
}

const DEV_SCRIPT_PRIORITY = ["dev", "start", "serve", "preview", "develop"];
const PREWARM_DIRNAME = ".prewarm";

// Warm "harvest"-friendly space colors that match the renderer palette so a
// project's auto-created space looks at home in the spaces rail.
const SPACE_PALETTE = ["#e0a82e", "#d98032", "#c2503f", "#5fa67f", "#3f8fa6", "#a86fb0"];

/**
 * Discovers, opens, and generates projects. Each project is 1:1 with a space:
 * opening a project creates (or reuses) a dedicated space named after the
 * project, switches to it, and opens an editor workspace tab inside it.
 *
 * Project metadata lives in app state (so it is visible to the renderer, CLI,
 * and agents and survives restarts), while live dev-server processes are owned
 * by `DevServerService` and associated to a project by its `cwd`. Generated
 * projects are created from on-disk templates under `generatedRoot` (e.g.
 * `~/Documents/meith`), and a small prewarm buffer keeps a few ready-to-allocate
 * app projects around for instant "new project" flows.
 */
export class ProjectService {
  constructor(
    private readonly appState: AppStateService,
    private readonly spaces: SpaceService,
    private readonly browserTabs: BrowserTabService,
    private readonly devServers: DevServerService,
    private readonly logger: Logger,
    private readonly options: ProjectServiceOptions,
  ) {}

  // ---- Reads -------------------------------------------------------------

  list(): Project[] {
    return this.appState.getState().projects;
  }

  get(id: string): Project | undefined {
    return this.appState.getState().projects.find((p) => p.id === id);
  }

  getByCwd(cwd: string): Project | undefined {
    const norm = normalizeCwd(cwd);
    return this.appState.getState().projects.find((p) => p.cwd === norm);
  }

  /** The project hosted by a space (1:1), if any. */
  getBySpace(spaceId: string): Project | undefined {
    const space = this.appState.getState().spaces.find((s) => s.id === spaceId);
    if (!space?.projectId) return undefined;
    return this.get(space.projectId);
  }

  /** Absolute root under which generated projects are created. */
  get generatedRoot(): string {
    return this.options.generatedRoot;
  }

  /**
   * Inspect a directory: detect package manager, framework, and runnable
   * scripts from its package.json. Does not persist anything.
   */
  detect(cwd: string): ProjectDetection {
    const dir = normalizeCwd(cwd);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      throw new ProjectError(`Project path does not exist or is not a directory: ${dir}`);
    }
    const pkg = readPackageJson(dir);
    const scripts: ProjectScript[] = pkg?.scripts
      ? Object.entries(pkg.scripts).map(([name, command]) => ({
          name,
          command: String(command),
        }))
      : [];
    return {
      name: (typeof pkg?.name === "string" && pkg.name) || basename(dir) || dir,
      framework: detectFramework(dir, pkg),
      packageManager: detectPackageManager(dir, pkg),
      scripts,
      hasPackageJson: pkg !== null,
    };
  }

  // ---- Open flow ---------------------------------------------------------

  /**
   * Open (or refresh) a project at `cwd` into a dedicated space (1:1):
   *
   *  - validate the path and detect its metadata,
   *  - resolve the hosting space (an explicit `spaceId`, the project's existing
   *    space, or a freshly created space named after the project),
   *  - upsert the persisted project record and link it to the space,
   *  - open an editor workspace tab in that space,
   *  - optionally start its dev server.
   *
   * This is also how a folder is "opened" — the space is generated from the
   * project's (folder) name.
   */
  open(input: {
    cwd: string;
    spaceId?: string;
    kind?: ProjectKind;
    startDevServer?: boolean;
    devScript?: string;
    displayName?: string;
  }): OpenProjectResult {
    const cwd = normalizeCwd(input.cwd);
    const detection = this.detect(cwd);
    const projectName = input.displayName?.trim() || detection.name;
    const now = Date.now();

    const existing = this.getByCwd(cwd);
    const id = existing?.id ?? newProjectId();

    // Resolve the hosting space: explicit > project's existing space > new one.
    const space = this.resolveSpace({
      explicitSpaceId: input.spaceId,
      existingSpaceId: existing?.spaceId,
      projectId: id,
      name: projectName,
    });
    // Ensure the active space is the project's space.
    if (this.spaces.getActiveSpaceId() !== space.id) this.spaces.switchTo(space.id);

    // Open an editor workspace tab anchored to the project root, in its space.
    const workspaceTab = this.browserTabs.openWorkspaceTab({
      title: projectName,
      cwd,
      kind: "editor",
      spaceId: space.id,
    });

    const project: Project = {
      id,
      name: projectName,
      cwd,
      kind: input.kind ?? existing?.kind ?? "app",
      spaceId: space.id,
      framework: detection.framework,
      packageManager: detection.packageManager,
      scripts: detection.scripts,
      browserTabIds: existing?.browserTabIds ?? [],
      workspaceTabIds: dedupe([...(existing?.workspaceTabIds ?? []), workspaceTab.id]),
      createdAt: existing?.createdAt ?? now,
      lastOpenedAt: now,
    };

    this.appState.update((draft) => {
      const idx = draft.projects.findIndex((p) => p.id === id);
      if (idx >= 0) draft.projects[idx] = project;
      else draft.projects.push(project);
    }, "project_open");
    // Link the space to this project (1:1).
    const boundSpace = this.spaces.bindProject(space.id, id);

    this.logger.info(
      "Project",
      `opened ${project.name} (${project.framework}/${project.packageManager}) @ ${cwd} in space ${space.id}`,
    );

    let devServer: DevServer | null = null;
    if (input.startDevServer) {
      devServer = this.startDevServer(id, input.devScript);
    }

    return { project, space: boundSpace, workspaceTab, devServer };
  }

  /**
   * Resolve the space that should host a project being opened. Prefers an
   * explicit id, then the project's previously linked space (if it still
   * exists), otherwise creates a new space named after the project.
   */
  private resolveSpace(input: {
    explicitSpaceId?: string;
    existingSpaceId?: string | null;
    projectId: string;
    name: string;
  }): Space {
    if (input.explicitSpaceId) {
      const found = this.spaces.get(input.explicitSpaceId);
      if (!found) throw new ProjectError(`Unknown space: ${input.explicitSpaceId}`);
      if (found.projectId && found.projectId !== input.projectId) {
        throw new ProjectError(
          `Space "${found.name}" already hosts another project (${found.projectId})`,
        );
      }
      return found;
    }
    if (input.existingSpaceId) {
      const found = this.spaces.get(input.existingSpaceId);
      if (found) {
        if (found.projectId && found.projectId !== input.projectId) {
          throw new ProjectError(
            `Project's linked space "${found.name}" is already bound to another project (${found.projectId})`,
          );
        }
        return found;
      }
    }
    // Every space is a project: if the active space is still empty (e.g. the
    // seeded "Default" space, or a fresh space with no project yet), adopt it
    // and rename it after the project rather than leaving a dangling space.
    const activeId = this.spaces.getActiveSpaceId();
    const active = activeId ? this.spaces.get(activeId) : undefined;
    if (active && !active.projectId) {
      return this.spaces.update(active.id, { name: input.name });
    }
    return this.spaces.create({ name: input.name, color: this.nextSpaceColor() });
  }

  /** Pick the next palette color based on the current number of spaces. */
  private nextSpaceColor(): string {
    const n = this.appState.getState().spaces.length;
    return SPACE_PALETTE[n % SPACE_PALETTE.length];
  }

  // ---- Dev server control ------------------------------------------------

  /** Start the dev server for a project, using the package manager + script. */
  startDevServer(projectId: string, scriptName?: string): DevServer {
    const project = this.get(projectId);
    if (!project) throw new ProjectError(`Unknown project: ${projectId}`);

    const script = pickDevScript(project.scripts, scriptName);
    if (!script) {
      throw new ProjectError(
        scriptName
          ? `Project "${project.name}" has no "${scriptName}" script`
          : `Project "${project.name}" has no runnable dev/start script`,
      );
    }

    const { command, args } = runScriptCommand(project.packageManager, script.name);
    const server = this.devServers.start({
      cwd: project.cwd,
      command,
      args,
      name: `${project.name}:${script.name}`,
    });
    this.logger.info(
      "Project",
      `started dev server for ${project.name} (${command} ${args.join(" ")})`,
    );
    return server;
  }

  /** Stop every running dev server associated (by cwd) with a project. */
  stopDevServer(projectId: string, signal?: NodeJS.Signals): { stopped: number } {
    const project = this.get(projectId);
    if (!project) throw new ProjectError(`Unknown project: ${projectId}`);
    let stopped = 0;
    for (const server of this.devServers.findByCwd(project.cwd)) {
      if (this.devServers.stop(server.id, signal)) stopped += 1;
    }
    return { stopped };
  }

  /** Dev servers (live) currently associated with a project, by cwd. */
  devServersForProject(projectId: string): DevServer[] {
    const project = this.get(projectId);
    if (!project) return [];
    return this.devServers.findByCwd(project.cwd);
  }

  // ---- Templates ---------------------------------------------------------

  /** List the available project templates discovered on disk. */
  listTemplates(): TemplateInfo[] {
    const root = this.options.templatesDir;
    if (!existsSync(root)) return [];
    const out: TemplateInfo[] = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(root, entry.name);
      const pkg = readPackageJson(path);
      out.push({
        name: entry.name,
        kind: entry.name.includes("plugin") ? "plugin" : "app",
        description:
          (typeof pkg?.description === "string" && pkg.description) ||
          `The ${entry.name} template`,
        path,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Generate a new project by copying a template into the generated root, then
   * open it into a new space. Use this for both app and plugin templates (the
   * template name determines its kind).
   */
  createFromTemplate(input: {
    template: string;
    name?: string;
    open?: boolean;
    startDevServer?: boolean;
  }): {
    project: Project | null;
    space: Space | null;
    cwd: string;
    workspaceTab: WorkspaceTab | null;
    devServer: DevServer | null;
  } {
    const tpl = this.listTemplates().find((t) => t.name === input.template);
    if (!tpl) {
      throw new ProjectError(
        `Unknown template "${input.template}". Available: ${
          this.listTemplates()
            .map((t) => t.name)
            .join(", ") || "none"
        }`,
      );
    }
    const dest = this.uniqueDestination(input.name ?? input.template);
    const generatedName = basename(dest);
    mkdirSync(this.options.generatedRoot, { recursive: true });
    cpSync(tpl.path, dest, { recursive: true });
    rewritePackageName(dest, generatedName);
    this.logger.info("Project", `generated ${tpl.name} -> ${dest}`);

    if (input.open === false) {
      return {
        project: null,
        space: null,
        cwd: dest,
        workspaceTab: null,
        devServer: null,
      };
    }
    const opened = this.open({
      cwd: dest,
      kind: tpl.kind,
      startDevServer: input.startDevServer,
      displayName: generatedName,
    });
    return { ...opened, cwd: dest };
  }

  /** Convenience: create a meith plugin project from the plugin template. */
  createPlugin(input: {
    name?: string;
    open?: boolean;
  }): ReturnType<ProjectService["createFromTemplate"]> {
    const tpl =
      this.listTemplates().find((t) => t.kind === "plugin")?.name ?? "plugin-basic";
    return this.createFromTemplate({ ...input, template: tpl });
  }

  // ---- Prewarm buffer ----------------------------------------------------

  /** Path holding prewarmed (ready-to-allocate) app project copies. */
  private prewarmRoot(): string {
    return join(this.options.generatedRoot, PREWARM_DIRNAME);
  }

  private prewarmSlots(): string[] {
    const root = this.prewarmRoot();
    if (!existsSync(root)) return [];
    return readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(root, e.name));
  }

  prewarmStatus(): { ready: number; slots: string[] } {
    const slots = this.prewarmSlots();
    return { ready: slots.length, slots };
  }

  /**
   * Ensure at least `count` ready app projects are buffered. Each is a full
   * template copy that can be allocated instantly. Returns the new buffer size.
   */
  prewarm(count = 1): { ready: number } {
    const appTemplate =
      this.listTemplates().find((t) => t.kind === "app")?.name ?? "app-basic";
    const tpl = this.listTemplates().find((t) => t.name === appTemplate);
    if (!tpl) throw new ProjectError("No app template available to prewarm");

    const root = this.prewarmRoot();
    mkdirSync(root, { recursive: true });
    let ready = this.prewarmSlots().length;
    while (ready < count) {
      const slot = join(root, `slot_${newProjectId()}`);
      cpSync(tpl.path, slot, { recursive: true });
      ready += 1;
    }
    this.logger.info("Project", `prewarm buffer ready (${ready})`);
    return { ready };
  }

  /**
   * Allocate a prewarmed app project (or generate one on demand if the buffer
   * is empty), move it to a named directory, open it into a new space, and
   * start its dev server.
   */
  allocatePrewarmed(input: {
    name?: string;
    startDevServer?: boolean;
  }): OpenProjectResult & { cwd: string; fromBuffer: boolean } {
    const slots = this.prewarmSlots();
    const dest = this.uniqueDestination(input.name ?? "app");

    let fromBuffer = false;
    if (slots[0]) {
      mkdirSync(this.options.generatedRoot, { recursive: true });
      renameSync(slots[0], dest);
      fromBuffer = true;
    } else {
      const appTemplate =
        this.listTemplates().find((t) => t.kind === "app")?.name ?? "app-basic";
      const tpl = this.listTemplates().find((t) => t.name === appTemplate);
      if (!tpl) throw new ProjectError("No app template available to allocate");
      mkdirSync(this.options.generatedRoot, { recursive: true });
      cpSync(tpl.path, dest, { recursive: true });
    }
    const generatedName = basename(dest);
    rewritePackageName(dest, generatedName);

    const opened = this.open({
      cwd: dest,
      kind: "app",
      startDevServer: input.startDevServer ?? true,
      displayName: generatedName,
    });
    this.logger.info(
      "Project",
      `allocated ${fromBuffer ? "prewarmed" : "fresh"} project @ ${dest}`,
    );
    return { ...opened, cwd: dest, fromBuffer };
  }

  // ---- Internals ---------------------------------------------------------

  /** A non-colliding destination path under the generated root for `name`. */
  private uniqueDestination(name: string): string {
    const slug = slugify(name);
    let dest = join(this.options.generatedRoot, slug);
    let n = 2;
    while (existsSync(dest)) {
      dest = join(this.options.generatedRoot, `${slug}-${n}`);
      n += 1;
    }
    return dest;
  }
}

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------

type PackageJson = {
  name?: unknown;
  description?: unknown;
  scripts?: Record<string, unknown>;
  packageManager?: unknown;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
};

function readPackageJson(dir: string): PackageJson | null {
  const path = join(dir, "package.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
  } catch {
    return null;
  }
}

function rewritePackageName(dir: string, name: string): void {
  const path = join(dir, "package.json");
  if (!existsSync(path)) return;
  const pkg = readPackageJson(dir);
  if (!pkg) {
    throw new ProjectError(`Generated template has invalid package.json: ${path}`);
  }
  pkg.name = name;
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

function allDeps(pkg: PackageJson | null): Record<string, unknown> {
  return { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
}

function detectPackageManager(dir: string, pkg: PackageJson | null): PackageManager {
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(dir, "yarn.lock"))) return "yarn";
  if (existsSync(join(dir, "bun.lockb")) || existsSync(join(dir, "bun.lock"))) {
    return "bun";
  }
  if (existsSync(join(dir, "package-lock.json"))) return "npm";
  // Fall back to the corepack `packageManager` field, e.g. "pnpm@9.0.0".
  if (typeof pkg?.packageManager === "string") {
    const name = pkg.packageManager.split("@")[0];
    if (name === "pnpm" || name === "yarn" || name === "npm" || name === "bun") {
      return name;
    }
  }
  return "unknown";
}

function detectFramework(dir: string, pkg: PackageJson | null): ProjectFramework {
  const deps = allDeps(pkg);
  const has = (name: string) => Object.hasOwn(deps, name);
  // Config files are the strongest signal.
  if (hasFileLike(dir, "next.config") || has("next")) return "nextjs";
  if (has("@remix-run/react") || has("@remix-run/node")) return "remix";
  if (has("astro") || hasFileLike(dir, "astro.config")) return "astro";
  if (hasFileLike(dir, "vite.config") || has("vite")) return "vite";
  if (has("svelte") || has("@sveltejs/kit")) return "svelte";
  if (has("vue")) return "vue";
  if (has("react") || has("react-dom")) return "react";
  if (pkg) return "node";
  return "unknown";
}

function hasFileLike(dir: string, base: string): boolean {
  for (const ext of [".js", ".mjs", ".cjs", ".ts", ".mts"]) {
    if (existsSync(join(dir, `${base}${ext}`))) return true;
  }
  return false;
}

function pickDevScript(
  scripts: ProjectScript[],
  preferred?: string,
): ProjectScript | null {
  if (preferred) return scripts.find((s) => s.name === preferred) ?? null;
  for (const name of DEV_SCRIPT_PRIORITY) {
    const found = scripts.find((s) => s.name === name);
    if (found) return found;
  }
  return scripts[0] ?? null;
}

/** Build the argv that runs a named package.json script for a package manager. */
function runScriptCommand(
  pm: PackageManager,
  script: string,
): { command: string; args: string[] } {
  switch (pm) {
    case "pnpm":
      return { command: "pnpm", args: ["run", script] };
    case "yarn":
      return { command: "yarn", args: [script] };
    case "bun":
      return { command: "bun", args: ["run", script] };
    default:
      return { command: "npm", args: ["run", script] };
  }
}

function normalizeCwd(cwd: string): string {
  let p = cwd.trim();
  if (p === "~") p = homedir();
  else if (p.startsWith("~/")) p = join(homedir(), p.slice(2));
  return isAbsolute(p) ? p : resolve(p);
}

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "project";
}

function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}
