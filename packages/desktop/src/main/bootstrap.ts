import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { MeithConfig } from "@meith/shared";
import type { BrowserViewHost } from "./browser/BrowserViewHost.js";
import { AgentService } from "./services/AgentService.js";
import { AppStateService } from "./services/AppStateService.js";
import { BrowserTabService } from "./services/BrowserTabService.js";
import { DevServerService } from "./services/DevServerService.js";
import { Logger } from "./services/Logger.js";
import { ProjectService } from "./services/ProjectService.js";
import { SpaceService } from "./services/SpaceService.js";
import { StorageService } from "./services/StorageService.js";
import { TerminalService } from "./services/TerminalService.js";
import { ToolSocketService } from "./services/ToolSocketService.js";
import { ArtifactStore } from "./storage/ArtifactStore.js";
import { createAppTools } from "./tools/appTools.js";
import { createBrowserTools } from "./tools/browserTools.js";
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
  agents: AgentService;
  storage: StorageService;
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
}

/** The `~/.meith` directory and the config file path inside it. */
export function meithPaths() {
  const home = process.env.MEITH_HOME ?? join(homedir(), ".meith");
  return { home, configPath: join(home, "config.json") };
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
  const spaces = new SpaceService(appState, browserTabs, logger);
  const devServers = new DevServerService(logger);
  const terminals = new TerminalService(logger);
  const projects = new ProjectService(logger);
  const storage = new StorageService({ dataDir: userDataPath, appState, logPath });

  const registry = new ToolRegistry();
  const deps = { appState, browserTabs, spaces, devServers, logger, storage };
  registry.registerAll(createBrowserTools(deps));
  registry.registerAll(createSpaceTools(deps));
  registry.registerAll(createAppTools(deps));
  registry.registerAll(createStorageTools(deps));

  const agents = new AgentService(registry, logger);

  const socket = new ToolSocketService(socketPath, registry, logger);
  await socket.start();

  // Recreate live browser views for any tabs restored from persisted state so
  // focus/navigation/screenshots operate on real views after a restart.
  await browserTabs.hydrate();

  logger.info("Bootstrap", "service container ready");

  // Idempotent: `before-quit` can fire more than once and other paths may also
  // request shutdown, so the teardown work must run at most once.
  let shutdownPromise: Promise<void> | null = null;
  const shutdown = (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      registry.beginShutdown();
      await socket.stop();
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
    agents,
    storage,
    registry,
    socket,
    config,
    shutdown,
  };
}
