import { join } from "node:path";
import { BrowserWindow, app } from "electron";
import { type ServiceContainer, bootstrap } from "./bootstrap.js";
import { registerIpcHandlers } from "./ipc/handlers.js";

let mainWindow: BrowserWindow | null = null;
let container: ServiceContainer | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());

  // electron-vite injects ELECTRON_RENDERER_URL during dev.
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  // The Electron-provided per-user data directory is our userDataPath.
  container = await bootstrap(app.getPath("userData"));
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
