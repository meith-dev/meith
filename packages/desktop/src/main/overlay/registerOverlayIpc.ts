import { type BrowserWindow, ipcMain } from "electron";
import type {
  OverlayMenuDescriptor,
  OverlayMenuResult,
  OverlayTooltipDescriptor,
} from "../../bridge.js";
import type { OverlayWindow } from "./OverlayWindow.js";

/**
 * Overlay relay channel names. Kept as literals (in sync with
 * `src/preload/index.ts`) so the main process never imports preload/renderer
 * code.
 */
const CH = {
  // main window -> main process
  menuShow: "meith:overlay:menu:show",
  tooltipShow: "meith:overlay:tooltip:show",
  tooltipHide: "meith:overlay:tooltip:hide",
  // overlay window -> main process
  menuResolve: "meith:overlay:menu:resolve",
  // main process -> overlay window
  renderMenu: "meith:overlay:render:menu",
  renderTooltip: "meith:overlay:render:tooltip",
  renderHideTooltip: "meith:overlay:render:hideTooltip",
  // main process -> main window
  menuResult: "meith:overlay:menu:result",
} as const;

/**
 * Wire the overlay relay: the main window asks to show menus/tooltips, the main
 * process forwards those requests to the overlay window (toggling interactivity
 * for menus), and the overlay window's selection result is relayed back to the
 * main window.
 */
export function registerOverlayIpc(
  getOverlay: () => OverlayWindow | null,
  getMainWindow: () => BrowserWindow | null,
): void {
  ipcMain.on(CH.menuShow, (_event, descriptor: OverlayMenuDescriptor) => {
    const overlay = getOverlay();
    if (!overlay) return;
    overlay.send(CH.renderMenu, descriptor);
    // Capture the mouse + keyboard while the menu is open.
    overlay.setInteractive(true);
  });

  ipcMain.on(CH.tooltipShow, (_event, descriptor: OverlayTooltipDescriptor) => {
    // Tooltips stay click-through; only forward the render request.
    getOverlay()?.send(CH.renderTooltip, descriptor);
  });

  ipcMain.on(CH.tooltipHide, () => {
    getOverlay()?.send(CH.renderHideTooltip);
  });

  ipcMain.on(CH.menuResolve, (_event, result: OverlayMenuResult) => {
    // Return the overlay to click-through and hand the result to the app.
    getOverlay()?.setInteractive(false);
    const win = getMainWindow();
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(CH.menuResult, result);
    }
  });
}
