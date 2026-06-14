import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { ToolDescriptor } from "@meith/protocol";
import {
  type InstalledPlugin,
  type PluginApiName,
  type PluginGrants,
  type PluginManifest,
  PluginManifestSchema,
  type ToolCapability,
} from "@meith/shared";
import type { AppStateService } from "./AppStateService.js";
import type { Logger } from "./Logger.js";

/** A structured plugin-host error with a coarse code for transport mapping. */
export class PluginError extends Error {
  readonly code: "PERMISSION_DENIED" | "INVALID" | "NOT_FOUND" | "NOT_ENABLED";
  constructor(code: PluginError["code"], message: string) {
    super(message);
    this.name = "PluginError";
    this.code = code;
  }
}

/** Resolved, APPROVED identity for a live plugin webContents. */
export interface ResolvedPluginIdentity {
  pluginId: string;
  approvedApis: PluginApiName[];
  approvedCapabilities: ToolCapability[];
}

export interface PluginHostOptions {
  /** Lazily read the registry's tool descriptors for capability gating. */
  describeTools: () => ToolDescriptor[];
}

/**
 * Owns the plugin lifecycle AND the security boundary for the
 * `window.meithPlugin` bridge.
 *
 * Security invariants enforced here (see Phase 11 plan):
 * 1. Split grants — the manifest's REQUESTED grants are stored, but only the
 *    user-APPROVED grants are ever consulted for enforcement.
 * 2. Authoritative identity — the webContents.id -> pluginId map is the ONLY
 *    source of runtime identity. It is populated by the main process when a
 *    plugin tab is created and revoked on navigation/teardown. Nothing the
 *    plugin page sends is trusted.
 * 3. Filesystem containment — plugin roots and entry paths are resolved with
 *    realpath and rejected if they escape the plugin's own directory.
 */
export class PluginHostService {
  /** webContents.id -> pluginId. The ONLY source of runtime plugin identity. */
  private readonly liveByWebContents = new Map<number, string>();
  /** webContents.id -> tabId, so plugin tool calls can be scoped to their tab. */
  private readonly tabByWebContents = new Map<number, string>();

  constructor(
    private readonly appState: AppStateService,
    private readonly logger: Logger,
    private readonly options: PluginHostOptions,
  ) {}

  // --- Lifecycle ---------------------------------------------------------

  /** All installed plugins. */
  list(): InstalledPlugin[] {
    return this.appState.getState().plugins;
  }

  /** Look up one installed plugin by id. */
  get(pluginId: string): InstalledPlugin | undefined {
    return this.appState.getState().plugins.find((p) => p.id === pluginId);
  }

  /**
   * Install (or re-install) a plugin from a local directory. The directory and
   * the manifest's entry path are realpath-resolved and validated to live
   * inside the plugin root. Newly installed plugins start DISABLED with EMPTY
   * approved grants — the user must approve before the plugin can run.
   */
  async installFromDirectory(dir: string): Promise<InstalledPlugin> {
    const root = await this.realpathOrThrow(dir, "plugin directory");
    const manifest = await this.readManifest(root);
    // Containment: the entry must resolve to a real file inside the root.
    await this.assertContainedFile(root, manifest.entry);
    return this.upsertRecord(manifest, { kind: "local-dir", path: root }, root);
  }

  /**
   * Install (or re-install) a plugin served by a dev server. The manifest is
   * fetched from `<url>/plugin.json`; the dev URL itself is what a plugin tab
   * loads (no filesystem containment applies). Like directory installs, the
   * plugin starts disabled with no approved grants.
   */
  async installFromDevUrl(url: string): Promise<InstalledPlugin> {
    let base: URL;
    try {
      base = new URL(url);
    } catch {
      throw new PluginError("INVALID", `Invalid dev server URL: ${url}`);
    }
    if (base.protocol !== "http:" && base.protocol !== "https:") {
      throw new PluginError("INVALID", "Dev server URL must be http(s).");
    }
    const manifest = await this.fetchManifest(new URL("plugin.json", base).toString());
    // Persist the normalized origin+path so resolveEntryUrl loads it verbatim.
    return this.upsertRecord(manifest, { kind: "dev-url", url: base.toString() }, url);
  }

  /** Build + persist an installed-plugin record, preserving compatible approvals. */
  private upsertRecord(
    manifest: PluginManifest,
    source: InstalledPlugin["source"],
    origin: string,
  ): InstalledPlugin {
    const existing = this.get(manifest.id);
    const requestedGrants = {
      capabilities: manifest.permissions,
      apis: manifest.requestedApis,
    };
    const record: InstalledPlugin = {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      source,
      manifest,
      requestedGrants,
      // Re-installing preserves prior approvals only if still a subset of the
      // (possibly changed) request; otherwise approvals reset for re-review.
      approvedGrants: existing
        ? this.intersectGrants(existing.approvedGrants, requestedGrants)
        : { capabilities: [], apis: [] },
      enabled: false,
      installedAt: existing?.installedAt ?? Date.now(),
    };

    this.appState.update((draft) => {
      const idx = draft.plugins.findIndex((p) => p.id === record.id);
      if (idx >= 0) draft.plugins[idx] = record;
      else draft.plugins.push(record);
    }, "plugin_install");
    this.logger.info("Plugins", `installed ${record.id} from ${origin}`);
    return record;
  }

  /**
   * Approve a subset of the requested grants for a plugin. Approving never
   * grants more than the manifest requested. Approved grants are the sole basis
   * for runtime enforcement.
   */
  approveGrants(pluginId: string, grants: PluginGrants): InstalledPlugin {
    const plugin = this.requirePlugin(pluginId);
    const approved = this.intersectGrants(grants, plugin.requestedGrants);
    const updated = this.mutatePlugin(pluginId, (p) => {
      p.approvedGrants = approved;
    });
    this.logger.info(
      "Plugins",
      `approved grants for ${pluginId}: apis=[${approved.apis.join(",")}] caps=[${approved.capabilities.join(",")}]`,
    );
    return updated;
  }

  /**
   * Enable or disable a plugin. A plugin may only be enabled once it has at
   * least its requested API scopes approved (so enabling can't silently bypass
   * the review step). Disabling immediately revokes any live tab authority.
   */
  setEnabled(pluginId: string, enabled: boolean): InstalledPlugin {
    const plugin = this.requirePlugin(pluginId);
    if (enabled) {
      const missing = plugin.requestedGrants.apis.filter(
        (a) => !plugin.approvedGrants.apis.includes(a),
      );
      if (missing.length > 0) {
        throw new PluginError(
          "PERMISSION_DENIED",
          `Cannot enable ${pluginId}: unapproved API scopes [${missing.join(", ")}]. Review permissions first.`,
        );
      }
    }
    const updated = this.mutatePlugin(pluginId, (p) => {
      p.enabled = enabled;
    });
    if (!enabled) this.revokePlugin(pluginId);
    this.logger.info("Plugins", `${enabled ? "enabled" : "disabled"} ${pluginId}`);
    return updated;
  }

  /**
   * Uninstall a plugin. For local-dir plugins the stored path is realpath-
   * checked, but NO files are deleted (we never installed into a managed store
   * in this phase — the plugin lives in the user's own directory). Any live tab
   * authority is revoked so already-open plugin tabs stop working immediately.
   */
  uninstall(pluginId: string): void {
    const plugin = this.requirePlugin(pluginId);
    this.revokePlugin(pluginId);
    this.appState.update((draft) => {
      draft.plugins = draft.plugins.filter((p) => p.id !== pluginId);
    }, "plugin_uninstall");
    this.logger.info("Plugins", `uninstalled ${plugin.id}`);
  }

  /**
   * Resolve the URL a plugin tab should load. Only installed + ENABLED plugins
   * can be opened. For local-dir plugins this is a `file://` URL to the realpath
   * of the (contained) entry file; for dev-url plugins it is the source URL.
   */
  async resolveEntryUrl(pluginId: string): Promise<string> {
    const plugin = this.requirePlugin(pluginId);
    if (!plugin.enabled) {
      throw new PluginError("NOT_ENABLED", `Plugin ${pluginId} is not enabled.`);
    }
    if (plugin.source.kind === "dev-url") return plugin.source.url;
    const root = await this.realpathOrThrow(plugin.source.path, "plugin directory");
    const entry = await this.assertContainedFile(root, plugin.manifest.entry);
    return `file://${entry}`;
  }

  // --- Identity (authoritative, main-process only) -----------------------

  /**
   * Register a plugin tab's webContents. Called by the browser host ONLY when a
   * plugin-mode view is created. Disabled/unknown plugins are ignored so they
   * never gain authority.
   */
  registerPluginTab(webContentsId: number, pluginId: string, tabId?: string): void {
    const plugin = this.get(pluginId);
    if (!plugin || !plugin.enabled) {
      this.logger.warn(
        "Plugins",
        `refused to register webContents ${webContentsId} for ${pluginId} (missing/disabled)`,
      );
      return;
    }
    this.liveByWebContents.set(webContentsId, pluginId);
    if (tabId) this.tabByWebContents.set(webContentsId, tabId);
  }

  /** Revoke a single webContents' plugin authority (navigation away / teardown). */
  revokeWebContents(webContentsId: number): void {
    this.liveByWebContents.delete(webContentsId);
    this.tabByWebContents.delete(webContentsId);
  }

  /** Revoke ALL live authority for a plugin (disable / uninstall). */
  private revokePlugin(pluginId: string): void {
    for (const [wcId, id] of this.liveByWebContents) {
      if (id === pluginId) this.revokeWebContents(wcId);
    }
  }

  /** The tab id bound to a plugin webContents, if any. */
  tabIdForWebContents(webContentsId: number): string | undefined {
    return this.tabByWebContents.get(webContentsId);
  }

  /**
   * Resolve the APPROVED identity for a webContents, or null if it is not a
   * live, enabled plugin tab. This is the single chokepoint every bridge call
   * goes through. It re-reads current state so a disable/uninstall is reflected
   * even for an already-open tab.
   */
  resolveByWebContents(webContentsId: number): ResolvedPluginIdentity | null {
    const pluginId = this.liveByWebContents.get(webContentsId);
    if (!pluginId) return null;
    const plugin = this.get(pluginId);
    if (!plugin || !plugin.enabled) return null;
    return {
      pluginId,
      approvedApis: plugin.approvedGrants.apis,
      approvedCapabilities: plugin.approvedGrants.capabilities,
    };
  }

  // --- Enforcement -------------------------------------------------------

  /** Assert a webContents is a live plugin with the given API approved. */
  assertApiAllowed(webContentsId: number, api: PluginApiName): ResolvedPluginIdentity {
    const identity = this.resolveByWebContents(webContentsId);
    if (!identity) {
      throw new PluginError("PERMISSION_DENIED", "Caller is not an active plugin tab.");
    }
    if (!identity.approvedApis.includes(api)) {
      throw new PluginError(
        "PERMISSION_DENIED",
        `Plugin ${identity.pluginId} has not been granted the "${api}" API.`,
      );
    }
    return identity;
  }

  /**
   * Assert a plugin webContents may call a specific tool. Requires the `tools`
   * API AND that every capability the tool declares is within the plugin's
   * APPROVED capabilities. Enforcement reads ONLY approved grants — a tool the
   * manifest requested but the user denied is rejected here.
   */
  assertToolAllowed(webContentsId: number, toolName: string): ResolvedPluginIdentity {
    const identity = this.assertApiAllowed(webContentsId, "tools");
    const descriptor = this.options.describeTools().find((t) => t.name === toolName);
    if (!descriptor) {
      throw new PluginError("NOT_FOUND", `Unknown tool: ${toolName}`);
    }
    const required = descriptor.capabilities ?? [];
    const missing = required.filter(
      (cap) => !identity.approvedCapabilities.includes(cap as ToolCapability),
    );
    if (missing.length > 0) {
      throw new PluginError(
        "PERMISSION_DENIED",
        `Plugin ${identity.pluginId} lacks capabilities [${missing.join(", ")}] required by "${toolName}".`,
      );
    }
    return identity;
  }

  // --- Internals ---------------------------------------------------------

  private requirePlugin(pluginId: string): InstalledPlugin {
    const plugin = this.get(pluginId);
    if (!plugin)
      throw new PluginError("NOT_FOUND", `Plugin ${pluginId} is not installed.`);
    return plugin;
  }

  private mutatePlugin(
    pluginId: string,
    fn: (p: InstalledPlugin) => void,
  ): InstalledPlugin {
    let result: InstalledPlugin | undefined;
    this.appState.update((draft) => {
      const p = draft.plugins.find((x) => x.id === pluginId);
      if (p) {
        fn(p);
        result = p;
      }
    }, "plugin_update");
    if (!result)
      throw new PluginError("NOT_FOUND", `Plugin ${pluginId} is not installed.`);
    return result;
  }

  /** Intersect `grants` with `bound` so the result never exceeds `bound`. */
  private intersectGrants(grants: PluginGrants, bound: PluginGrants): PluginGrants {
    return {
      capabilities: grants.capabilities.filter((c) => bound.capabilities.includes(c)),
      apis: grants.apis.filter((a) => bound.apis.includes(a)),
    };
  }

  /** Read + validate the manifest from `package.json` `meith` field or `plugin.json`. */
  private async readManifest(root: string): Promise<PluginManifest> {
    const candidates = [
      { file: path.join(root, "plugin.json"), pick: (j: unknown) => j },
      {
        file: path.join(root, "package.json"),
        pick: (j: unknown) => (j as { meith?: unknown }).meith,
      },
    ];
    for (const { file, pick } of candidates) {
      const raw = await this.readJsonIfExists(file);
      if (raw === undefined) continue;
      const candidate = pick(raw);
      if (candidate === undefined) continue;
      const parsed = PluginManifestSchema.safeParse(candidate);
      if (!parsed.success) {
        throw new PluginError(
          "INVALID",
          `Invalid plugin manifest in ${path.basename(file)}: ${parsed.error.message}`,
        );
      }
      return parsed.data;
    }
    throw new PluginError(
      "INVALID",
      "No plugin manifest found (expected plugin.json or a `meith` field in package.json).",
    );
  }

  /** Fetch + validate a manifest from a dev server URL. */
  private async fetchManifest(manifestUrl: string): Promise<PluginManifest> {
    let res: Response;
    try {
      res = await fetch(manifestUrl, { headers: { accept: "application/json" } });
    } catch (err) {
      throw new PluginError(
        "NOT_FOUND",
        `Could not reach dev server manifest at ${manifestUrl}: ${(err as Error).message}`,
      );
    }
    if (!res.ok) {
      throw new PluginError(
        "NOT_FOUND",
        `Dev server returned ${res.status} for ${manifestUrl} (expected plugin.json).`,
      );
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new PluginError("INVALID", `Malformed JSON manifest at ${manifestUrl}.`);
    }
    const parsed = PluginManifestSchema.safeParse(json);
    if (!parsed.success) {
      throw new PluginError(
        "INVALID",
        `Invalid plugin manifest at ${manifestUrl}: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  }

  private async readJsonIfExists(file: string): Promise<unknown | undefined> {
    try {
      const text = await this.readFileText(file);
      return JSON.parse(text);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      if (err instanceof SyntaxError) {
        throw new PluginError("INVALID", `Malformed JSON in ${path.basename(file)}.`);
      }
      throw err;
    }
  }

  private readFileText(file: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = createReadStream(file, { encoding: "utf8" });
      stream.on("data", (c) => chunks.push(Buffer.from(c)));
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      stream.on("error", reject);
    });
  }

  /** realpath a path or throw a structured error. */
  private async realpathOrThrow(p: string, label: string): Promise<string> {
    try {
      return await realpath(p);
    } catch {
      throw new PluginError("NOT_FOUND", `Cannot resolve ${label}: ${p}`);
    }
  }

  /**
   * Resolve `relPath` against `root` and verify (after realpath) that it is a
   * real FILE strictly inside `root`. Rejects absolute paths, `..` traversal,
   * and symlinks that escape the directory.
   */
  private async assertContainedFile(root: string, relPath: string): Promise<string> {
    if (path.isAbsolute(relPath)) {
      throw new PluginError("INVALID", `Entry path must be relative: ${relPath}`);
    }
    const joined = path.resolve(root, relPath);
    // Cheap textual check before touching the filesystem.
    const rel = path.relative(root, joined);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new PluginError(
        "INVALID",
        `Entry path escapes the plugin directory: ${relPath}`,
      );
    }
    const real = await this.realpathOrThrow(joined, "plugin entry");
    // After following symlinks, the target must STILL be inside the root.
    const realRel = path.relative(root, real);
    if (realRel.startsWith("..") || path.isAbsolute(realRel)) {
      throw new PluginError(
        "INVALID",
        `Entry path resolves outside the plugin directory (symlink escape): ${relPath}`,
      );
    }
    const info = await stat(real);
    if (!info.isFile()) {
      throw new PluginError("INVALID", `Entry path is not a file: ${relPath}`);
    }
    return real;
  }
}
