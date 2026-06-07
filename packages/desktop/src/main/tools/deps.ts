import type { AppStateService } from "../services/AppStateService.js";
import type { BrowserTabService } from "../services/BrowserTabService.js";
import type { DevServerService } from "../services/DevServerService.js";
import type { Logger } from "../services/Logger.js";
import type { SpaceService } from "../services/SpaceService.js";
import type { StorageService } from "../services/StorageService.js";

/**
 * Dependencies injected into tool factories. Keeping this explicit (rather than
 * importing singletons) keeps tools testable and lets the headless harness wire
 * the same tools without Electron.
 */
export interface ToolDeps {
  appState: AppStateService;
  browserTabs: BrowserTabService;
  spaces: SpaceService;
  devServers: DevServerService;
  logger: Logger;
  storage: StorageService;
}
