/**
 * Electron permission-request hardening tests.
 *
 * `ElectronBrowserViewHost` has a dependency on real Electron APIs
 * (`WebContentsView`, `session`, etc.) that are unavailable in the Vitest
 * environment. We test the hardening contract by:
 *
 * 1. Building a minimal mock of the Electron surface that records the handlers
 *    passed to `setPermissionRequestHandler` and `setWindowOpenHandler`.
 * 2. Instantiating `ElectronBrowserViewHost` with that mock injected via the
 *    module-level vi.mock() seam.
 * 3. Creating a view and then exercising the recorded handlers directly.
 *
 * The assertions confirm:
 * - Every permission request (camera, microphone, geolocation, notifications,
 *   midi, hid, serial, bluetooth, clipboard-read, fullscreen) is denied.
 * - Every window.open() / new-window request returns `{ action: "deny" }`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- Minimal Electron surface mock ----------------------------------------

type PermissionHandler = (
  wc: unknown,
  permission: string,
  callback: (allow: boolean) => void,
) => void;

type WindowOpenHandler = () => { action: string };

interface MockSession {
  setPermissionRequestHandler: ReturnType<typeof vi.fn>;
}

interface MockWebContents {
  id: number;
  session: MockSession;
  navigationHistory: { canGoBack: () => boolean; canGoForward: () => boolean };
  setWindowOpenHandler: ReturnType<typeof vi.fn>;
  debugger: {
    attach: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    sendCommand: ReturnType<typeof vi.fn>;
  };
  on: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  getURL: ReturnType<typeof vi.fn>;
}

interface MockView {
  webContents: MockWebContents;
  setBounds: ReturnType<typeof vi.fn>;
}

let permissionHandler: PermissionHandler | null = null;
let windowOpenHandler: WindowOpenHandler | null = null;

function makeMockWebContents(): MockWebContents {
  const session: MockSession = {
    setPermissionRequestHandler: vi.fn((handler: PermissionHandler) => {
      permissionHandler = handler;
    }),
  };
  return {
    id: Math.floor(Math.random() * 100000),
    session,
    navigationHistory: { canGoBack: () => false, canGoForward: () => false },
    setWindowOpenHandler: vi.fn((handler: WindowOpenHandler) => {
      windowOpenHandler = handler;
    }),
    debugger: {
      attach: vi.fn(),
      on: vi.fn(),
      sendCommand: vi.fn().mockResolvedValue({}),
    },
    on: vi.fn(),
    loadURL: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    getURL: vi.fn().mockReturnValue("https://example.test"),
  };
}

function makeMockView(): MockView {
  return {
    webContents: makeMockWebContents(),
    setBounds: vi.fn(),
  };
}

// Mock the `electron` module used by ElectronBrowserViewHost.
vi.mock("electron", () => {
  return {
    WebContentsView: vi.fn(() => makeMockView()),
  };
});

// ---- Tests ----------------------------------------------------------------

describe("ElectronBrowserViewHost Electron permission hardening", () => {
  beforeEach(async () => {
    permissionHandler = null;
    windowOpenHandler = null;
    // Reset the mock factory so each test gets its own view.
    const { WebContentsView } = vi.mocked(
      await import("electron"),
    ) as { WebContentsView: ReturnType<typeof vi.fn> };
    WebContentsView.mockImplementation(() => makeMockView());
  });

  it("registers a permission request handler when a view is created", async () => {
    const { ElectronBrowserViewHost } = await import(
      "../browser/ElectronBrowserViewHost.js"
    );
    const host = new ElectronBrowserViewHost({ getWindow: () => null });
    host.createView("tab-1", "https://example.test");
    expect(permissionHandler).not.toBeNull();
  });

  it("denies all OS-level permission requests", async () => {
    const { ElectronBrowserViewHost } = await import(
      "../browser/ElectronBrowserViewHost.js"
    );
    const host = new ElectronBrowserViewHost({ getWindow: () => null });
    host.createView("tab-1", "https://example.test");

    const PERMISSIONS = [
      "camera",
      "microphone",
      "geolocation",
      "notifications",
      "midi",
      "midiSysex",
      "pointerLock",
      "fullscreen",
      "openExternal",
      "clipboard-read",
      "display-capture",
      "hid",
      "serial",
      "usb",
    ];

    for (const permission of PERMISSIONS) {
      let allowed: boolean | undefined;
      permissionHandler!(null, permission, (a) => {
        allowed = a;
      });
      expect(allowed, `permission "${permission}" should be denied`).toBe(false);
    }
  });

  it("registers a window-open handler when a view is created", async () => {
    const { ElectronBrowserViewHost } = await import(
      "../browser/ElectronBrowserViewHost.js"
    );
    const host = new ElectronBrowserViewHost({ getWindow: () => null });
    host.createView("tab-1", "https://example.test");
    expect(windowOpenHandler).not.toBeNull();
  });

  it("denies all window.open() / new-window requests", async () => {
    const { ElectronBrowserViewHost } = await import(
      "../browser/ElectronBrowserViewHost.js"
    );
    const host = new ElectronBrowserViewHost({ getWindow: () => null });
    host.createView("tab-1", "https://example.test");

    const result = windowOpenHandler!();
    expect(result).toEqual({ action: "deny" });
  });
});
