import type { MeithBridge, OverlayMenuItem } from "../../../bridge";

/**
 * The overlay window is a real-Electron-only feature: tooltips and dropdown
 * menus are rendered there so they paint ABOVE the native browser
 * `WebContentsView`. `window.meith` is only injected by the preload inside the
 * desktop app — the in-memory mock used by `pnpm dev:renderer`, preview, and
 * jsdom tests is never assigned to `window`, so this returns `undefined` there
 * and callers fall back to a local (base-ui) render.
 */
export function getOverlayApi(): MeithBridge["overlay"] | undefined {
  return typeof window !== "undefined" ? window.meith?.overlay : undefined;
}

/** A menu item paired with the local handler to run when it's chosen. */
export interface OverlayActionItem extends OverlayMenuItem {
  onSelect: () => void;
}

let menuSeq = 0;
/** Monotonic id so concurrent/queued menu opens never collide. */
export function nextOverlayMenuId(): string {
  menuSeq += 1;
  return `menu_${menuSeq}_${Date.now()}`;
}
