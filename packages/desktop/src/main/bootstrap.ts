import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import type { AideConfig } from "@aide/shared";
import { Logger } from "./services/Logger.js";
import { AppStateService } from "./services/AppStateService.js";
import { BrowserTabService } from "./services/BrowserTabService.js";
import { DevServerService } from "./services/DevServerService.js";
import { TerminalService } from "./services/TerminalService.js";
import { ProjectService } from "./services/ProjectService.js";
import { AgentService } from "./services/AgentService.js";
import { ToolSocketService } from "./services/ToolSocketService.js";
import { ToolRegistry } from "./tools/registry.js";
import { createBrowserTools } from "./tools/browserTools.js";
import { createAppTools } from "./tools/appTools.js";

/** Everything the app wires up. Returned so the renderer/IPC can use it. */
export interface ServiceContainer {
  logger: Logger;
  appState: AppStateService;
  browserTabs: BrowserTabService;
  devServers: DevServerService;
  terminals: TerminalService;
  projects: ProjectService;
  agents: AgentService;
  registry: ToolRegistry;
  socket: ToolSocketService;
  config: AideConfig;
}

/** The `~/.aide` directory and the config file path inside it. */
export function aidePaths() {
  const home = process.env.AIDE_HOME ?? join(homedir(), ".aide");
  return { home, configPath: join(home, "config.json") };
}

/**
 * Wire all services together for a given userDataPath, write `~/.aide/config.json`,
 * register tools, and start the local socket server.
 *
 * This deliberately does NOT import Electron, so it can run from the headless
 * harness and tests as well as from the real main process.
 */
export async function bootstrap(userDataPath: string): Promise<ServiceContainer> {
  const logger = new Logger();
  mkdirSync(userDataPath, { recursive: true });

  const { home, configPath } = aidePaths();
  const socketPath = join(userDataPath, "tool.sock");

  const config: AideConfig = { userDataPath, socketPath, version: 1 };
  mkdirSync(home, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  logger.info("Bootstrap", `wrote config to ${configPath}`);

  const appState = new AppStateService(join(userDataPath, "state.json"), logger);
  const browserTabs = new BrowserTabService(appState, logger);
  const devServers = new DevServerService(logger);
  const terminals = new TerminalService(logger);
  const projects = new ProjectService(logger);

  const registry = new ToolRegistry();
  const deps = { appState, browserTabs, devServers, logger };
  registry.registerAll(createBrowserTools(deps));
  registry.registerAll(createAppTools(deps));

  const agents = new AgentService(registry, logger);

  const socket = new ToolSocketService(socketPath, registry, logger);
  await socket.start();

  logger.info("Bootstrap", "service container ready");

  return {
    logger,
    appState,
    browserTabs,
    devServers,
    terminals,
    projects,
    agents,
    registry,
    socket,
    config,
  };
}
