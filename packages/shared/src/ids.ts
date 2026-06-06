/**
 * Small, dependency-light ID helpers. Centralized here so every package
 * (main process, CLI, renderer, future agent runtime) generates IDs the same
 * way. Uses the global `crypto` (Node 20+ and browsers) so this module stays
 * bundler-safe for the renderer — no `node:crypto` import.
 */

function uuid(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === "function") return g.crypto.randomUUID();
  // Fall back to a manual implementation for very old runtimes.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Generate a prefixed, sortable-ish id, e.g. `tab_a1b2c3d4`. */
export function createId(prefix: string): string {
  return `${prefix}_${uuid().replace(/-/g, "").slice(0, 12)}`;
}

export const newBrowserTabId = () => createId("btab");
export const newWorkspaceTabId = () => createId("wtab");
export const newSpaceId = () => createId("space");
export const newRequestId = () => createId("req");
export const newSessionId = () => createId("sess");
export const newMessageId = () => createId("msg");
