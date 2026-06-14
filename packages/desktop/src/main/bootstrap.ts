import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type InstanceRecord,
  InstanceRecordSchema,
  type MeithConfig,
} from "@meith/shared";
import { AcpAdapter } from "./agent/adapters/AcpAdapter.js";
import { MockAdapter } from "./agent/adapters/MockAdapter.js";
import type { BrowserViewHost } from "./browser/BrowserViewHost.js";
import type { PtyHost } from "./process/PtyHost.js";
import { AgentConfigStore } from "./services/AgentConfigStore.js";
import { AgentService } from "./services/AgentService.js";
import { AgentStore } from "./services/AgentStore.js";
import { AppStateService } from "./services/AppStateService.js";
import { BrowserTabService } from "./services/BrowserTabService.js";
import { DevServerService } from "./services/DevServerService.js";
import { Logger } from "./services/Logger.js";
import { McpBridgeService } from "./services/McpBridgeService.js";
import { PluginHostService } from "./services/PluginHostService.js";
import { ProjectService } from "./services/ProjectService.js";
import { SpaceService } from "./services/SpaceService.js";
import { StorageService } from "./services/StorageService.js";
import { TerminalService } from "./services/TerminalService.js";
import { ToolSocketService } from "./services/ToolSocketService.js";
import { WorkspaceFileService } from "./services/WorkspaceFileService.js";
import { ArtifactStore } from "./storage/ArtifactStore.js";
import { createAppTools } from "./tools/appTools.js";
import { createBrowserTools } from "./tools/browserTools.js";
import { createFileTools } from "./tools/fileTools.js";
import { createPluginTools } from "./tools/pluginTools.js";
import { createProcessTools } from "./tools/processTools.js";
import { createProjectTools } from "./tools/projectTools.js";
import { ToolRegistry } from "./tools/registry.js";
import { createSpaceTools } from "./tools/spaceTools.js";
import { createStorageTools } from "./tools/storageTools.js";

/** Everything the app wires up. Returned so the renderer/IPC can use it. */
export interface ServiceContainer {
  logger: Logger;
  appState: AppStateService;
  browserTabs: BrowserTabService;
  spaces: SpaceService;
  devServers: DevServerService;
  terminals: TerminalService;
  projects: ProjectService;
  files: WorkspaceFileService;
  agents: AgentService;
  mcpBridge: McpBridgeService;
  storage: StorageService;
  plugins: PluginHostService;
  registry: ToolRegistry;
  socket: ToolSocketService;
  config: MeithConfig;
  /** Stop accepting new tool calls and tear down the socket server. */
  shutdown: () => Promise<void>;
}

/** Optional injection points for the real (Electron) main process. */
export interface BootstrapOptions {
  /**
   * Live browser view host. The Electron main process passes a
   * `WebContentsView`-backed implementation; headless callers (tests, harness,
   * CLI runtime) omit it and get the in-memory default.
   */
  browserViewHost?: BrowserViewHost;
  /**
   * Live PTY backend for terminals. The Electron main process passes a
   * `node-pty`-backed host; headless callers (tests, harness, CLI runtime) omit
   * it and get the in-memory simulated shell.
   */
  ptyHost?: PtyHost;
  /** Override the directory containing project templates. */
  templatesDir?: string;
  /** Override the root directory generated projects are created under. */
  generatedProjectsRoot?: string;
  /**
   * App version recorded in this instance's registry file. The Electron main
   * process passes `app.getVersion()`; headless callers may omit it.
   */
  appVersion?: string;
  /** Friendly label for the instance registry (defaults to userData basename). */
  instanceLabel?: string;
  /**
   * Capture the main application window as a PNG. The Electron main process
   * passes a `webContents.capturePage()`-backed implementation; headless callers
   * omit it and the `app_screenshot` tool reports that no window is available.
   */
  captureAppWindow?: () => Promise<Buffer>;
  /**
   * When true, `bootstrap()` does NOT hydrate live browser views before
   * returning; the caller must call `container.browserTabs.hydrate()` itself.
   * The Electron main process sets this so hydration runs only AFTER the
   * container is assigned and IPC handlers are registered — otherwise a
   * rehydrated plugin tab would create its webContents while the plugin
   * authority wiring (`container.plugins`) and the identity IPC handler are not
   * yet available, leaving the plugin without its bridge. Headless callers omit
   * it and keep the convenient hydrate-on-bootstrap behavior.
   */
  deferHydration?: boolean;
}

/** The `~/.meith` directory and the config + instances paths inside it. */
export function meithPaths() {
  const home = process.env.MEITH_HOME ?? join(homedir(), ".meith");
  return {
    home,
    configPath: join(home, "config.json"),
    instancesDir: join(home, "instances"),
  };
}

/**
 * Remove instance records whose owning process is no longer alive (or whose
 * socket file has vanished). Returns the records that are still live. Used at
 * boot so the registry self-heals after crashes / hard kills.
 */
export function cleanupStaleInstances(
  instancesDir: string,
  logger?: Logger,
): InstanceRecord[] {
  if (!existsSync(instancesDir)) return [];
  const live: InstanceRecord[] = [];
  for (const file of readdirSync(instancesDir)) {
    if (!file.endsWith(".json")) continue;
    const full = join(instancesDir, file);
    try {
      const record = InstanceRecordSchema.parse(JSON.parse(readFileSync(full, "utf8")));
      if (isProcessAlive(record.pid) && existsSync(record.socketPath)) {
        live.push(record);
      } else {
        rmSync(full, { force: true });
        logger?.info("Bootstrap", `reaped stale instance ${file}`);
      }
    } catch {
      // Corrupt/unreadable record: drop it.
      rmSync(full, { force: true });
    }
  }
  return live;
}

/** True if a process with `pid` exists and we may signal it. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but is owned by another user.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Locate the `templates/` directory that ships project templates. Honors
 * `MEITH_TEMPLATES_DIR`, otherwise walks up from this module to find a
 * `templates` folder containing `app-basic` (works in dev, tests, and the
 * packaged app). Returns a best-effort cwd-relative path if nothing is found.
 */
export function findTemplatesDir(): string {
  if (process.env.MEITH_TEMPLATES_DIR) return process.env.MEITH_TEMPLATES_DIR;
  let dir: string;
  try {
    dir = dirname(fileURLToPath(import.meta.url));
  } catch {
    dir = process.cwd();
  }
  for (const start of [dir, process.cwd()]) {
    let cur = start;
    for (let i = 0; i < 8; i++) {
      const candidate = join(cur, "templates");
      if (existsSync(join(candidate, "app-basic"))) return candidate;
      const parent = dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
  }
  return join(process.cwd(), "templates");
}

/**
 * Wire all services together for a given userDataPath, write `~/.meith/config.json`,
 * register tools, and start the local socket server.
 *
 * This deliberately does NOT import Electron, so it can run from the headless
 * harness and tests as well as from the real main process.
 */
export async function bootstrap(
  userDataPath: string,
  options: BootstrapOptions = {},
): Promise<ServiceContainer> {
  mkdirSync(userDataPath, { recursive: true });
  const logPath = join(userDataPath, "logs.jsonl");
  const logger = new Logger({ logPath });

  const { home, configPath } = meithPaths();
  const socketPath = join(userDataPath, "tool.sock");

  const config: MeithConfig = { userDataPath, socketPath, version: 1 };
  mkdirSync(home, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  logger.info("Bootstrap", `wrote config to ${configPath}`);

  const appState = new AppStateService(join(userDataPath, "state.json"), logger);
  // ArtifactStore appends "artifacts" itself, so pass the userData root to land
  // files in <userData>/artifacts (not <userData>/artifacts/artifacts).
  const artifacts = new ArtifactStore(userDataPath);
  const browserTabs = new BrowserTabService(appState, logger, {
    host: options.browserViewHost,
    artifacts,
  });
  // Runtime environment injected into every spawned terminal / dev server so
  // tools and plugins launched inside them can reach this running app: the
  // socket path for dev-log attachment plus app-scoped identifiers.
  const runtimeEnv: Record<string, string> = {
    MEITH_SOCKET: socketPath,
    MEITH_HOME: home,
    MEITH_USER_DATA: userDataPath,
  };
  const devServers = new DevServerService(logger, runtimeEnv);
  const terminals = new TerminalService(logger, {
    host: options.ptyHost,
    runtimeEnv,
  });
  // SpaceService can stop a hosted project's dev servers when its space closes,
  // so it receives the DevServerService. ProjectService depends on SpaceService
  // (to create/bind a project's 1:1 space); the dependency runs one way.
  const spaces = new SpaceService(appState, browserTabs, logger, devServers, terminals);
  // Generated projects live under ~/Documents/meith by default so users can
  // find them in a familiar location (overridable for tests/headless).
  const generatedRoot =
    options.generatedProjectsRoot ?? join(homedir(), "Documents", "meith");
  const templatesDir = options.templatesDir ?? findTemplatesDir();
  const projects = new ProjectService(appState, spaces, browserTabs, devServers, logger, {
    generatedRoot,
    templatesDir,
  });
  const storage = new StorageService({ dataDir: userDataPath, appState, logPath });
  // Editor/IDE file authority (Phase 8). Boundary-checks every read/write
  // against known project roots and provides TypeScript diagnostics.
  const files = new WorkspaceFileService(projects, logger, appState);

  const registry = new ToolRegistry();
  // Plugin host (Phase 11). Owns the plugin lifecycle and the security boundary
  // for the `window.meithPlugin` bridge. It reads tool capabilities lazily from
  // the registry so capability gating reflects whatever tools are registered.
  const plugins = new PluginHostService(appState, logger, {
    describeTools: () => registry.describe(),
  });
  const deps = {
    appState,
    browserTabs,
    spaces,
    devServers,
    terminals,
    projects,
    files,
    logger,
    storage,
    plugins,
  };
  registry.registerAll(createBrowserTools(deps));
  registry.registerAll(createSpaceTools(deps));
  registry.registerAll(
    createAppTools(deps, {
      artifacts,
      captureAppWindow: options.captureAppWindow,
    }),
  );
  registry.registerAll(createProcessTools(deps));
  registry.registerAll(createProjectTools(deps));
  registry.registerAll(createFileTools(deps));
  registry.registerAll(createStorageTools(deps));
  registry.registerAll(createPluginTools(deps));

  // Agent runtime (Phase 9). Durable session/transcript store + user config,
  // an in-process MCP bridge that exposes the SAME registry to an external ACP
  // agent with `caller: "agent"` scoping, and a pluggable adapter selected by
  // config (deterministic mock by default; ACP subprocess when configured).
  const agentStore = new AgentStore(userDataPath);
  const agentConfig = new AgentConfigStore(userDataPath);
  const mcpBridge = new McpBridgeService(logger);
  const agents = new AgentService(registry, logger, {
    store: agentStore,
    configStore: agentConfig,
    appState,
    mcpBridge,
  });
  agents.registerAdapter(
    agentConfig.get().adapter === "acp"
      ? new AcpAdapter(agentConfig, logger)
      : new MockAdapter(),
  );
  // Re-select the adapter whenever the configured kind changes.
  agents.on("config", (cfg: { adapter: string }) => {
    agents.registerAdapter(
      cfg.adapter === "acp" ? new AcpAdapter(agentConfig, logger) : new MockAdapter(),
    );
  });
  agents.hydrate();
  agents.startIdleGc();

  const socket = new ToolSocketService(socketPath, registry, logger);
  await socket.start();

  // Instance registry (Phase 10): publish this runtime so the CLI can discover,
  // list, and target it among several concurrently running instances. Reap any
  // stale records left behind by crashed/killed instances first.
  const { instancesDir } = meithPaths();
  mkdirSync(instancesDir, { recursive: true });
  cleanupStaleInstances(instancesDir, logger);
  const instanceFile = join(instancesDir, `${process.pid}.json`);
  const instanceRecord: InstanceRecord = {
    pid: process.pid,
    socketPath,
    userDataPath,
    appVersion: options.appVersion ?? "0.0.0",
    startedAt: Date.now(),
    cwd: process.cwd(),
    label: options.instanceLabel ?? basename(userDataPath),
  };
  writeFileSync(instanceFile, JSON.stringify(instanceRecord, null, 2), "utf8");
  logger.info("Bootstrap", `registered instance ${instanceFile}`);

  // Recreate live browser views for any tabs restored from persisted state so
  // focus/navigation/screenshots operate on real views after a restart. The
  // Electron entry defers this (see `deferHydration`) so plugin-tab rehydration
  // happens only after the container + IPC handlers are wired.
  if (!options.deferHydration) await browserTabs.hydrate();

  logger.info("Bootstrap", "service container ready");

  // Idempotent: `before-quit` can fire more than once and other paths may also
  // request shutdown, so the teardown work must run at most once.
  let shutdownPromise: Promise<void> | null = null;
  const shutdown = (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      registry.beginShutdown();
      // Deregister this instance so the CLI stops offering it as a target.
      rmSync(instanceFile, { force: true });
      await socket.stop();
      // Tear down agent runs (abort live adapters), the MCP bridge, and flush
      // the session index/config to disk.
      await agents.dispose();
      await mcpBridge.stop();
      // Reliably reap every spawned process before exit: kill dev-server
      // process groups (and their child trees) and all live terminals.
      devServers.stopAll();
      terminals.killAll();
      // Tear down all live browser views/debuggers so nothing is leaked when
      // the process exits.
      await browserTabs.disposeViews();
      // Flush any debounced state write so nothing is lost on exit.
      appState.flush();
      logger.info("Bootstrap", "shutdown complete");
    })();
    return shutdownPromise;
  };

  return {
    logger,
    appState,
    browserTabs,
    spaces,
    devServers,
    terminals,
    projects,
    files,
    agents,
    mcpBridge,
    storage,
    plugins,
    registry,
    socket,
    config,
    shutdown,
  };
}
