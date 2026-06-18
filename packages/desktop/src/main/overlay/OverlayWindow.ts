import { join } from "node:path";
import { BrowserWindow } from "electron";

/**
 * A transparent, frameless, always-on-top child window that sits exactly over
 * the main window's content area. It exists solely to render floating UI
 * (tooltips, dropdown menus) ABOVE the native browser `WebContentsView`, which
 * always paints over the main window's renderer DOM.
 *
 * It loads the SAME renderer bundle as the main window via the `#overlay` hash
 * route (so `main.tsx` mounts the lightweight overlay document instead of the
 * workbench) and reuses the same preload — no second Vite entry / preload.
 *
 * The window is click-through by default (`setIgnoreMouseEvents`), so tooltips
 * never steal interaction from the page. It only captures the mouse (and takes
 * focus, for keyboard menu nav) while an interactive menu is open.
 */
export class OverlayWindow {
  private win: BrowserWindow | null = null;
  private readonly getParent: () => BrowserWindow | null;

  constructor(getParent: () => BrowserWindow | null) {
    this.getParent = getParent;
  }

  /** Create the overlay window and bind it to the parent window's lifecycle. */
  create(): void {
    const parent = this.getParent();
    if (!parent) return;

    this.win = new BrowserWindow({
      parent,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      // Do not paint a backdrop; the document is transparent.
      backgroundColor: "#00000000",
      webPreferences: {
        preload: join(__dirname, "../preload/index.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Float above the parent window AND its native child views.
    this.win.setAlwaysOnTop(true, "pop-up-menu");
    // Click-through until a menu opens.
    this.win.setIgnoreMouseEvents(true, { forward: true });

    const devUrl = process.env.ELECTRON_RENDERER_URL;
    if (devUrl) {
      void this.win.loadURL(`${devUrl}#overlay`);
    } else {
      void this.win.loadFile(join(__dirname, "../renderer/index.html"), {
        hash: "overlay",
      });
    }

    this.syncBounds();
    this.bindParentEvents(parent);

    this.win.on("closed", () => {
      this.win = null;
    });

    // Reveal once the parent is visible; keep it shown (transparent +
    // click-through) so toggling content never flickers a window in/out.
    if (parent.isVisible()) this.show();
  }

  /** The overlay window's webContents id, used to route relayed IPC. */
  get webContentsId(): number | null {
    return this.win && !this.win.isDestroyed() ? this.win.webContents.id : null;
  }

  /** Send a render message to the overlay document. */
  send(channel: string, ...args: unknown[]): void {
    if (!this.win || this.win.isDestroyed() || this.win.webContents.isDestroyed()) {
      return;
    }
    this.win.webContents.send(channel, ...args);
  }

  /**
   * Toggle whether the overlay captures the mouse and keyboard. Enabled while a
   * menu is open (so items are clickable and keyboard-navigable); disabled
   * otherwise so the overlay is fully click-through.
   */
  setInteractive(interactive: boolean): void {
    if (!this.win || this.win.isDestroyed()) return;
    if (interactive) {
      this.win.setIgnoreMouseEvents(false);
      this.win.setFocusable(true);
      this.win.focus();
    } else {
      this.win.setIgnoreMouseEvents(true, { forward: true });
      this.win.setFocusable(false);
      // Return focus to the main window so the page/shell keeps keyboard input.
      this.getParent()?.focus();
    }
  }

  /** Align the overlay exactly to the parent window's content rectangle. */
  syncBounds(): void {
    const parent = this.getParent();
    if (!parent || parent.isDestroyed() || !this.win || this.win.isDestroyed()) return;
    const bounds = parent.getContentBounds();
    this.win.setBounds(bounds);
  }

  private show(): void {
    if (!this.win || this.win.isDestroyed()) return;
    // showInactive avoids stealing focus from the main window.
    this.win.showInactive();
    this.syncBounds();
  }

  private hide(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.hide();
  }

  private bindParentEvents(parent: BrowserWindow): void {
    const resync = () => this.syncBounds();
    parent.on("move", resync);
    parent.on("resize", resync);
    parent.on("enter-full-screen", resync);
    parent.on("leave-full-screen", resync);
    parent.on("restore", () => {
      this.show();
    });
    parent.on("show", () => {
      this.show();
    });
    parent.on("hide", () => this.hide());
    parent.on("minimize", () => this.hide());
    parent.on("closed", () => this.destroy());
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }
}
