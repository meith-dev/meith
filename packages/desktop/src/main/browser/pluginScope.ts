import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The navigation boundary a plugin view's authority is bound to.
 *  - `origin`: http(s) (dev-url) plugins — authority follows the exact origin.
 *  - `file`: local-dir plugins — authority is bound to the realpath of the
 *    ENTRY FILE. `file://` URLs have an opaque ("null") origin, so an
 *    origin-based check would let a local plugin navigate to any other
 *    `file://` document and keep its bridge. Binding to the realpath'd entry
 *    file closes that hole (hash/query routing keeps the same file path).
 *
 * This module is intentionally free of any Electron import so the containment
 * policy can be unit-tested directly.
 */
export type PluginScope =
  | { kind: "origin"; origin: string }
  | { kind: "file"; filePath: string };

/** Best-effort origin of a URL; falls back to the trimmed string. */
export function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/+$/, "");
  }
}

/** Resolve a `file:` URL to a realpath, falling back to the decoded path. */
function fileRealpath(url: string): string {
  const p = fileURLToPath(url);
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Derive the authority scope a plugin view is bound to from its entry URL.
 * `file:` entries bind to the realpath'd entry file (origin-agnostic); all
 * other schemes bind to the URL origin.
 */
export function pluginScopeFor(url: string): PluginScope {
  if (url.startsWith("file:")) {
    return { kind: "file", filePath: fileRealpath(url) };
  }
  return { kind: "origin", origin: originOf(url) };
}

/**
 * Whether navigating to `navUrl` keeps a plugin view inside its bound scope.
 *
 * Security-critical: this is what prevents a local (`file://`) plugin from
 * navigating to another document and retaining its privileged bridge.
 */
export function navInPluginScope(scope: PluginScope, navUrl: string): boolean {
  if (scope.kind === "origin") {
    const origin = originOf(navUrl);
    // Reject opaque/empty origins (e.g. `file://` -> "null") so an origin-bound
    // dev plugin can never be satisfied by a `file://` navigation.
    if (!origin || origin === "null") return false;
    return origin === scope.origin;
  }
  // file scope: only the exact entry file (by realpath) stays in scope.
  // Hash/query/in-page routing preserves the pathname, so SPAs are unaffected.
  if (!navUrl.startsWith("file:")) return false;
  try {
    return fileRealpath(navUrl) === scope.filePath;
  } catch {
    return false;
  }
}
