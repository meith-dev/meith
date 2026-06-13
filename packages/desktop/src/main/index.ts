import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BrowserViewportSchema } from "@meith/shared";
import { net, BrowserWindow, app, ipcMain, protocol } from "electron";
import { type ServiceContainer, bootstrap } from "./bootstrap.js";
import { ElectronBrowserViewHost } from "./browser/ElectronBrowserViewHost.js";
import { IPC, registerIpcHandlers } from "./ipc/handlers.js";
import { NodePtyHost } from "./process/NodePtyHost.js";
import type { PtyHost } from "./process/PtyHost.js";

/**
 * Fallback inset (px) used only until the renderer reports its measured
 * browser viewport via the `meith:browser:viewport` channel.
 */
const FALLBACK_CHROME_TOP = 96;
const ARTIFACT_PROTOCOL = "meith-artifact";

let mainWindow: BrowserWindow | null = null;
let container: ServiceContainer | null = null;
let viewHost: ElectronBrowserViewHost | null = null;
let artifactProtocolRegistered = false;

protocol.registerSchemesAsPrivileged([
  {
    scheme: ARTIFACT_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
    },
  },
]);

function registerArtifactProtocol(userDataPath: string): void {
  if (artifactProtocolRegistered) return;
  artifactProtocolRegistered = true;
  const artifactRoot = resolve(userDataPath, "artifacts");
  protocol.handle(ARTIFACT_PROTOCOL, async (request) => {
    try {
      const url = new URL(request.url);
      const name = basename(decodeURIComponent(url.pathname.replace(/^\/+/, "")));
      if (!name || name !== decodeURIComponent(url.pathname.replace(/^\/+/, ""))) {
        return new Response("Not found", { status: 404 });
      }
      const filePath = resolve(artifactRoot, name);
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

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
    // Plugin tabs (Phase 11) get the permission-gated plugin bridge instead.
    pluginPreloadPath: join(__dirname, "../preload/plugin.cjs"),
    // The host reports plugin webContents lifecycle so the plugin service can
    // AUTHORITATIVELY map (and revoke) webContents -> plugin identity. The
    // plugin page never supplies its own identity.
    onPluginWebContents: ({ tabId, pluginId, webContentsId }) => {
      container?.plugins.registerPluginTab(webContentsId, pluginId, tabId);
    },
    onPluginWebContentsGone: ({ webContentsId }) => {
      container?.plugins.revokeWebContents(webContentsId);
    },
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

  // Back terminals with a real node-pty process. If the native module is not
  // usable, keep the app bootable but make terminal creation fail clearly
  // instead of silently opening the headless/mock shell.
  let ptyHost: PtyHost;
  try {
    ptyHost = await NodePtyHost.create();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[v0] node-pty unavailable, terminals cannot start:", err);
    ptyHost = {
      spawn() {
        throw new Error(`node-pty is unavailable; cannot start terminal: ${reason}`);
      },
    };
  }

  // The Electron-provided per-user data directory is our userDataPath.
  container = await bootstrap(app.getPath("userData"), {
    browserViewHost: viewHost,
    ptyHost,
    appVersion: app.getVersion(),
    // Capture the main window for `meith app screenshot` / the app_screenshot
    // tool. Returns the PNG bytes from the live web contents.
    captureAppWindow: async () => {
      if (!mainWindow) throw new Error("Main window is not available");
      const image = await mainWindow.webContents.capturePage();
      return image.toPNG();
    },
  });
  registerArtifactProtocol(container.config.userDataPath);
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

// Electron does NOT wait for async `before-quit` listeners, so we must hold the
// quit ourselves: cancel the first quit, run the full async teardown, then quit
// again. The guard makes the handler idempotent (the second quit re-enters it).
let isQuitting = false;
app.on("before-quit", (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  void (async () => {
    try {
      // Full, idempotent teardown: registry stops accepting calls, the socket
      // server closes, all live browser views/debuggers are destroyed, and
      // pending app state is flushed.
      await container?.shutdown();
    } catch (err) {
      console.error("[v0] shutdown failed during quit:", err);
    } finally {
      app.quit();
    }
  })();
});
