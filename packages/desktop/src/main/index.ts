import { join } from "node:path";
import { BrowserWindow, app } from "electron";
import { type ServiceContainer, bootstrap } from "./bootstrap.js";
import { ElectronBrowserViewHost } from "./browser/ElectronBrowserViewHost.js";
import { registerIpcHandlers } from "./ipc/handlers.js";

/** Height (px) of the app chrome/sidebar header above the browser content. */
const CHROME_TOP = 96;

let mainWindow: BrowserWindow | null = null;
let container: ServiceContainer | null = null;
let viewHost: ElectronBrowserViewHost | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());
  // Keep the active browser view sized to the content region on resize.
  mainWindow.on("resize", () => viewHost?.layout());

  // electron-vite injects ELECTRON_RENDERER_URL during dev.
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  // Real browser views are backed by WebContentsView and laid out below the
  // app chrome. The host is injected so bootstrap() itself stays Electron-free.
  viewHost = new ElectronBrowserViewHost({
    getWindow: () => mainWindow,
    preloadPath: join(__dirname, "../preload/webContent.cjs"),
    getContentBounds: () => {
      const [width, height] = mainWindow?.getContentSize() ?? [1280, 820];
      return { x: 0, y: CHROME_TOP, width, height: Math.max(0, height - CHROME_TOP) };
    },
  });

  // The Electron-provided per-user data directory is our userDataPath.
  container = await bootstrap(app.getPath("userData"), { browserViewHost: viewHost });
  registerIpcHandlers(container, () => mainWindow);

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  await container?.socket.stop();
});
