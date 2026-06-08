import { join } from "node:path";
import { BrowserViewportSchema } from "@meith/shared";
import { BrowserWindow, app, ipcMain } from "electron";
import { type ServiceContainer, bootstrap } from "./bootstrap.js";
import { ElectronBrowserViewHost } from "./browser/ElectronBrowserViewHost.js";
import { IPC, registerIpcHandlers } from "./ipc/handlers.js";

/**
 * Fallback inset (px) used only until the renderer reports its measured
 * browser viewport via the `meith:browser:viewport` channel.
 */
const FALLBACK_CHROME_TOP = 96;

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

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
    // Resolve the startup race: attach any active view that was created during
    // bootstrap/hydrate before the window existed.
    viewHost?.attachActiveView();
  });
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
      return {
        x: 0,
        y: FALLBACK_CHROME_TOP,
        width,
        height: Math.max(0, height - FALLBACK_CHROME_TOP),
      };
    },
  });

  // Create the window BEFORE bootstrap so that, by the time the socket server
  // starts accepting tool calls (and hydrate() focuses the active tab), the
  // window exists and views can attach immediately.
  createWindow();

  // The Electron-provided per-user data directory is our userDataPath.
  container = await bootstrap(app.getPath("userData"), { browserViewHost: viewHost });
  registerIpcHandlers(container, () => mainWindow);

  // Viewport contract: the renderer reports the measured browser content
  // region; resize the native view to match instead of using a fixed inset.
  ipcMain.on(IPC.browserViewport, (_event, raw) => {
    const parsed = BrowserViewportSchema.safeParse(raw);
    if (parsed.success) viewHost?.setContentBounds(parsed.data);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  // Full, idempotent teardown: registry stops accepting calls, the socket
  // server closes, and pending app state is flushed.
  await container?.shutdown();
});
