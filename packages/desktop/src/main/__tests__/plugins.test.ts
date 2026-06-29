import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import type { ToolDescriptor } from "@meith/protocol";
import type { PluginApiName, ToolCapability } from "@meith/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildPluginApiShape } from "../../preload/pluginApiShape.js";
import { AppStateService } from "../services/AppStateService.js";
import { Logger } from "../services/Logger.js";
import { PluginError, PluginHostService } from "../services/PluginHostService.js";

/**
 * Phase 11 plugin security tests. These assert the mandated invariants:
 * normal tabs get no bridge, identity can't be spoofed, denied grants block
 * calls even when requested, navigation/teardown drops authority, manifest path
 * traversal/symlink escape is rejected, and disable/uninstall revokes live
 * tabs. AI streaming routing/cancellation is covered separately by the agent
 * tests; here we assert the API-gating layer that fronts it.
 */

let dir: string;
let appState: AppStateService;
let host: PluginHostService;

// A small fixed tool catalog the host gates against.
const TOOLS: ToolDescriptor[] = [
  { name: "get_tabs", description: "", capabilities: ["read-only"], inputSchema: {} },
  {
    name: "open_browser_tab",
    description: "",
    capabilities: ["controls-browser"],
    inputSchema: {},
  },
];

function makeHost(): PluginHostService {
  return new PluginHostService(appState, new Logger(), {
    describeTools: () => TOOLS,
    managedPluginsDir: join(dir, "managed"),
  });
}

/** Write a minimal valid plugin directory and return its path. */
function writePlugin(
  id: string,
  opts: { entry?: string; permissions?: string[]; apis?: string[] } = {},
): string {
  const root = join(dir, id);
  mkdirSync(root, { recursive: true });
  const entry = opts.entry ?? "index.html";
  // Only create the entry file if it's a simple in-root file.
  if (!entry.includes("..") && !entry.startsWith("/")) {
    writeFileSync(join(root, entry), "<!doctype html><title>plugin</title>");
  }
  writeFileSync(
    join(root, "plugin.json"),
    JSON.stringify({
      kind: "plugin",
      id,
      name: id,
      version: "1.0.0",
      entry,
      permissions: opts.permissions ?? [],
      requestedApis: opts.apis ?? [],
    }),
  );
  return root;
}

function writeTarGz(file: string, entries: Record<string, string>): void {
  const blocks: Buffer[] = [];
  for (const [name, text] of Object.entries(entries)) {
    const data = Buffer.from(text, "utf8");
    const header = Buffer.alloc(512, 0);
    header.write(name, 0, 100, "utf8");
    header.write("0000777\0", 100, 8, "ascii");
    header.write("0000000\0", 108, 8, "ascii");
    header.write("0000000\0", 116, 8, "ascii");
    header.write(octal(data.byteLength, 12), 124, 12, "ascii");
    header.write(octal(Math.floor(Date.now() / 1000), 12), 136, 12, "ascii");
    header.fill(" ", 148, 156);
    header.write("0", 156, 1, "ascii");
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(octal(sum, 8), 148, 8, "ascii");
    blocks.push(header, data, Buffer.alloc((512 - (data.byteLength % 512)) % 512, 0));
  }
  blocks.push(Buffer.alloc(1024, 0));
  writeFileSync(file, gzipSync(Buffer.concat(blocks)));
}

function octal(value: number, width: number): string {
  const text = value.toString(8);
  return `${"0".repeat(Math.max(0, width - text.length - 1))}${text}\0`;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "meith-plugins-"));
  appState = new AppStateService(join(dir, "state.json"), new Logger(), 0);
  host = makeHost();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("preload bridge shape", () => {
  it("exposes NOTHING to a normal (non-plugin) tab", () => {
    const transport = {} as never;
    expect(buildPluginApiShape(null, transport)).toBeNull();
  });

  it("attaches only the approved API namespaces", () => {
    const transport = {} as never;
    const api = buildPluginApiShape(
      {
        pluginId: "com.example.p",
        name: "P",
        version: "1.0.0",
        apis: ["tools", "storage"],
        capabilities: ["read-only"],
      },
      transport,
    );
    expect(api).not.toBeNull();
    expect(api?.tools).toBeDefined();
    expect(api?.storage).toBeDefined();
    expect(api?.cdp).toBeUndefined();
    expect(api?.ai).toBeUndefined();
  });
});

describe("install + manifest validation", () => {
  it("installs with requested grants but EMPTY approved grants and disabled", async () => {
    const root = writePlugin("com.example.hello", {
      permissions: ["read-only"],
      apis: ["tools"],
    });
    const rec = await host.installFromDirectory(root);
    expect(rec.requestedGrants.apis).toEqual(["tools"]);
    expect(rec.requestedGrants.capabilities).toEqual(["read-only"]);
    expect(rec.approvedGrants).toEqual({ capabilities: [], apis: [] });
    expect(rec.enabled).toBe(false);
  });

  it("rejects a directory without a manifest", async () => {
    const root = join(dir, "empty");
    mkdirSync(root, { recursive: true });
    await expect(host.installFromDirectory(root)).rejects.toBeInstanceOf(PluginError);
  });

  it("rejects an absolute or traversing entry path", async () => {
    const root = writePlugin("com.example.trav", { entry: "../escape.html" });
    await expect(host.installFromDirectory(root)).rejects.toMatchObject({
      code: "INVALID",
    });
  });

  it("rejects a symlinked entry that escapes the plugin directory", async () => {
    const root = writePlugin("com.example.sym", { entry: "link.html" });
    // Create an out-of-root target and symlink the entry to it.
    const outside = join(dir, "outside.html");
    writeFileSync(outside, "<!doctype html>");
    rmSync(join(root, "link.html"), { force: true });
    symlinkSync(outside, join(root, "link.html"));
    await expect(host.installFromDirectory(root)).rejects.toMatchObject({
      code: "INVALID",
    });
  });

  it("installs a packaged plugin archive into the managed store", async () => {
    const archive = join(dir, "plugin.tgz");
    writeTarGz(archive, {
      "package/plugin.json": JSON.stringify({
        kind: "plugin",
        id: "com.example.pkg",
        name: "Packaged",
        version: "1.0.0",
        entry: "index.html",
        permissions: ["read-only"],
        requestedApis: ["tools"],
      }),
      "package/index.html": "<!doctype html><title>packaged</title>",
    });

    const rec = await host.installFromArchive(archive);
    if (rec.source.kind !== "package") throw new Error("expected package source");
    expect(rec.source.path).toBe(join(dir, "managed", "com.example.pkg"));
    expect(existsSync(join(rec.source.path, "index.html"))).toBe(true);
    expect(rec.approvedGrants).toEqual({ capabilities: [], apis: [] });
    expect(rec.enabled).toBe(false);

    host.approveGrants("com.example.pkg", {
      capabilities: ["read-only"],
      apis: ["tools"],
    });
    host.setEnabled("com.example.pkg", true);
    expect(await host.resolveEntryUrl("com.example.pkg")).toContain("index.html");
  });

  it("rejects packaged plugin archives with escaping paths", async () => {
    const archive = join(dir, "bad.tgz");
    writeTarGz(archive, {
      "../escape.html": "nope",
      "package/plugin.json": "{}",
    });
    await expect(host.installFromArchive(archive)).rejects.toMatchObject({
      code: "INVALID",
    });
    expect(existsSync(join(dir, "escape.html"))).toBe(false);
  });

  it("rejects archives with raw ../ traversal entry names that escape the staging root", async () => {
    // Use a literal "../escape.txt" tar entry that, after path.resolve, would
    // land one directory above the staging root. writeTarGz only supports safe
    // path names, so we build this raw tar manually.
    const { gzipSync } = await import("node:zlib");

    function makeEntry(name: string, content: string): Buffer {
      const data = Buffer.from(content, "utf8");
      const h = Buffer.alloc(512, 0);
      // Write the entry name directly — no normalisation here.
      Buffer.from(name, "utf8").copy(h, 0, 0, Math.min(name.length, 99));
      h.fill(" ", 148, 156);
      h.write("0", 156, 1, "ascii"); // regular file
      h.write("ustar\0", 257, 6, "ascii");
      h.write("00", 263, 2, "ascii");
      h.write(data.byteLength.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
      let sum = 0;
      for (const b of h) sum += b;
      h.write(sum.toString(8).padStart(7, "0") + "\0", 148, 8, "ascii");
      const pad = (512 - (data.byteLength % 512)) % 512;
      return Buffer.concat([h, data, Buffer.alloc(pad, 0)]);
    }

    const blocks = Buffer.concat([
      makeEntry("../escape-traversal.txt", "pwned"),
      makeEntry("package/plugin.json", "{}"),
      Buffer.alloc(1024, 0),
    ]);
    const archive = join(dir, "raw-traversal.tgz");
    writeFileSync(archive, gzipSync(blocks));

    await expect(host.installFromArchive(archive)).rejects.toMatchObject({
      code: "INVALID",
    });
    expect(existsSync(join(dir, "escape-traversal.txt"))).toBe(false);
  });

  it("rejects archives that contain hard links (type 1)", async () => {
    // Build a raw tar with a type-1 (hard link) entry — writeTarGz always writes
    // regular files, so we build the raw tar ourselves and then gzip it.
    const { gzipSync } = await import("node:zlib");
    const header = Buffer.alloc(512, 0);
    header.write("package/link", 0, 100, "utf8");
    header.write("0000777\0", 100, 8, "ascii");
    header.write("0000000\0", 108, 8, "ascii");
    header.write("0000000\0", 116, 8, "ascii");
    header.write("00000000000\0", 124, 12, "ascii"); // size 0
    header.write("00000000000\0", 136, 12, "ascii"); // mtime
    header.fill(" ", 148, 156);
    header.write("1", 156, 1, "ascii"); // type = hard link
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");
    let sum = 0;
    for (const b of header) sum += b;
    header.write(sum.toString(8).padStart(7, "0") + "\0", 148, 8, "ascii");
    const blocks = Buffer.concat([header, Buffer.alloc(1024, 0)]);
    const archive = join(dir, "hardlink.tgz");
    writeFileSync(archive, gzipSync(blocks));
    await expect(host.installFromArchive(archive)).rejects.toMatchObject({
      code: "INVALID",
    });
  });

  it("rejects archives that contain symbolic links (type 2)", async () => {
    const { gzipSync } = await import("node:zlib");
    const header = Buffer.alloc(512, 0);
    header.write("package/symlink", 0, 100, "utf8");
    header.write("0000777\0", 100, 8, "ascii");
    header.fill(" ", 148, 156);
    header.write("2", 156, 1, "ascii"); // type = symlink
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");
    header.write("/etc/passwd", 157, 100, "utf8"); // link target
    let sum = 0;
    for (const b of header) sum += b;
    header.write(sum.toString(8).padStart(7, "0") + "\0", 148, 8, "ascii");
    const blocks = Buffer.concat([header, Buffer.alloc(1024, 0)]);
    const archive = join(dir, "symlink.tgz");
    writeFileSync(archive, gzipSync(blocks));
    await expect(host.installFromArchive(archive)).rejects.toMatchObject({
      code: "INVALID",
    });
  });

  it("rejects archives that exceed the maximum file count", async () => {
    // Build an archive with 2001 files (one over the limit of 2000).
    const entries: Record<string, string> = {
      "package/plugin.json": JSON.stringify({
        kind: "plugin",
        id: "com.example.toomany",
        name: "Many",
        version: "1.0.0",
        entry: "index.html",
        permissions: [],
        requestedApis: [],
      }),
      "package/index.html": "<!doctype html>",
    };
    for (let i = 0; i < 2000; i++) {
      entries[`package/asset-${i}.txt`] = `asset ${i}`;
    }
    const archive = join(dir, "toomany.tgz");
    writeTarGz(archive, entries);
    await expect(host.installFromArchive(archive)).rejects.toMatchObject({
      code: "INVALID",
    });
  });

  it("rejects archives with an oversized individual file entry", async () => {
    // Write an archive where a single file claims to be larger than 10 MB.
    // We set the size in the header but only put a few bytes so the test stays
    // fast; the size check happens before writing the body.
    const { gzipSync } = await import("node:zlib");

    function makeOversizedEntry(name: string, claimedSize: number): Buffer {
      const header = Buffer.alloc(512, 0);
      header.write(name, 0, Math.min(name.length, 100), "utf8");
      header.write("0000644\0", 100, 8, "ascii");
      header.fill(" ", 148, 156);
      header.write("0", 156, 1, "ascii"); // regular file
      header.write("ustar\0", 257, 6, "ascii");
      header.write("00", 263, 2, "ascii");
      const sizeStr = claimedSize.toString(8).padStart(11, "0") + "\0";
      header.write(sizeStr, 124, 12, "ascii");
      let sum = 0;
      for (const b of header) sum += b;
      header.write(sum.toString(8).padStart(7, "0") + "\0", 148, 8, "ascii");
      // Body: just one padded 512-byte block (we don't write all claimed bytes).
      return Buffer.concat([header, Buffer.alloc(512, 0x61)]);
    }

    const manifestJson = JSON.stringify({
      kind: "plugin",
      id: "com.example.oversized",
      name: "Oversized",
      version: "1.0.0",
      entry: "fat.bin",
      permissions: [],
      requestedApis: [],
    });

    const manifestEntry = (() => {
      const name = "package/plugin.json";
      const data = Buffer.from(manifestJson, "utf8");
      const h = Buffer.alloc(512, 0);
      h.write(name, 0, Math.min(name.length, 100), "utf8");
      h.write("0000644\0", 100, 8, "ascii");
      h.fill(" ", 148, 156);
      h.write("0", 156, 1, "ascii");
      h.write("ustar\0", 257, 6, "ascii");
      h.write("00", 263, 2, "ascii");
      h.write(data.byteLength.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
      let sum = 0;
      for (const b of h) sum += b;
      h.write(sum.toString(8).padStart(7, "0") + "\0", 148, 8, "ascii");
      const pad = 512 - (data.byteLength % 512 || 512);
      return Buffer.concat([h, data, Buffer.alloc(pad, 0)]);
    })();

    const oversized = makeOversizedEntry(
      "package/fat.bin",
      11 * 1024 * 1024, // 11 MB — exceeds 10 MB per-file limit
    );
    const blocks = Buffer.concat([manifestEntry, oversized, Buffer.alloc(1024, 0)]);
    const archive = join(dir, "oversized.tgz");
    writeFileSync(archive, gzipSync(blocks));

    await expect(host.installFromArchive(archive)).rejects.toMatchObject({
      code: "INVALID",
    });
  });
});

describe("dev-url install", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function stubFetch(handler: (url: string) => Response | Promise<Response>): void {
    globalThis.fetch = ((input: RequestInfo | URL) =>
      Promise.resolve(handler(String(input)))) as typeof fetch;
  }

  it("fetches /plugin.json from the dev origin and records a dev-url source", async () => {
    let requested = "";
    stubFetch((url) => {
      requested = url;
      return new Response(
        JSON.stringify({
          kind: "plugin",
          id: "com.example.dev",
          name: "Dev",
          version: "2.0.0",
          entry: "index.html",
          permissions: ["read-only"],
          requestedApis: ["tools"],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const rec = await host.installFromDevUrl("http://localhost:5180/app");
    expect(requested).toBe("http://localhost:5180/plugin.json");
    expect(rec.source).toEqual({ kind: "dev-url", url: "http://localhost:5180/app" });
    expect(rec.approvedGrants).toEqual({ capabilities: [], apis: [] });
    expect(rec.enabled).toBe(false);
    // An enabled dev-url plugin loads its source URL verbatim (no filesystem).
    host.approveGrants("com.example.dev", { capabilities: [], apis: ["tools"] });
    host.setEnabled("com.example.dev", true);
    expect(await host.resolveEntryUrl("com.example.dev")).toBe(
      "http://localhost:5180/app",
    );
  });

  it("rejects a non-http(s) dev URL", async () => {
    await expect(host.installFromDevUrl("file:///etc/passwd")).rejects.toMatchObject({
      code: "INVALID",
    });
  });

  it("surfaces an unreachable dev server as NOT_FOUND", async () => {
    stubFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    await expect(host.installFromDevUrl("http://localhost:9/app")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects an invalid manifest from the dev server", async () => {
    stubFetch(() => new Response(JSON.stringify({ not: "a manifest" }), { status: 200 }));
    await expect(host.installFromDevUrl("http://localhost:5180")).rejects.toMatchObject({
      code: "INVALID",
    });
  });
});

describe("grant approval + enable gating", () => {
  it("never approves more than the manifest requested", async () => {
    const root = writePlugin("com.example.scope", {
      permissions: ["read-only"],
      apis: ["tools"],
    });
    await host.installFromDirectory(root);
    const updated = host.approveGrants("com.example.scope", {
      capabilities: ["read-only", "controls-browser"],
      apis: ["tools", "ai"],
    });
    expect(updated.approvedGrants.capabilities).toEqual(["read-only"]);
    expect(updated.approvedGrants.apis).toEqual(["tools"]);
  });

  it("refuses to enable until requested APIs are approved", async () => {
    const root = writePlugin("com.example.gate", { apis: ["tools"] });
    await host.installFromDirectory(root);
    expect(() => host.setEnabled("com.example.gate", true)).toThrow(PluginError);
    host.approveGrants("com.example.gate", { capabilities: [], apis: ["tools"] });
    expect(host.setEnabled("com.example.gate", true).enabled).toBe(true);
  });
});

describe("authoritative identity", () => {
  async function installEnabled(
    id: string,
    apis: PluginApiName[],
    capabilities: ToolCapability[] = [],
  ): Promise<void> {
    const root = writePlugin(id, { apis, permissions: capabilities });
    await host.installFromDirectory(root);
    host.approveGrants(id, { capabilities, apis });
    host.setEnabled(id, true);
  }

  it("returns null for an unknown webContents (normal tab)", () => {
    expect(host.resolveByWebContents(999)).toBeNull();
  });

  it("cannot be spoofed: identity is keyed by the registered webContents id", async () => {
    await installEnabled("com.example.a", ["tools"], ["read-only"]);
    await installEnabled("com.example.b", ["tools"], ["read-only"]);
    host.registerPluginTab(10, "com.example.a", "tab-a");
    // webContents 10 is plugin A; nothing it sends can make it resolve to B.
    expect(host.resolveByWebContents(10)?.pluginId).toBe("com.example.a");
    expect(host.resolveByWebContents(11)).toBeNull();
  });

  it("denies a tool whose capability was requested but NOT approved", async () => {
    // Requests controls-browser but the user only approves read-only.
    const root = writePlugin("com.example.deny", {
      apis: ["tools"],
      permissions: ["read-only", "controls-browser"],
    });
    await host.installFromDirectory(root);
    host.approveGrants("com.example.deny", {
      capabilities: ["read-only"],
      apis: ["tools"],
    });
    host.setEnabled("com.example.deny", true);
    host.registerPluginTab(20, "com.example.deny", "tab");

    // read-only tool allowed; controls-browser tool denied.
    expect(host.assertToolAllowed(20, "get_tabs").pluginId).toBe("com.example.deny");
    expect(() => host.assertToolAllowed(20, "open_browser_tab")).toThrow(PluginError);
  });

  it("loses authority when its webContents navigates away / is destroyed", async () => {
    await installEnabled("com.example.nav", ["tools"], ["read-only"]);
    host.registerPluginTab(30, "com.example.nav", "tab");
    expect(host.resolveByWebContents(30)).not.toBeNull();
    host.revokeWebContents(30);
    expect(host.resolveByWebContents(30)).toBeNull();
    expect(() => host.assertToolAllowed(30, "get_tabs")).toThrow(PluginError);
  });

  it("revokes live tabs when the plugin is disabled", async () => {
    await installEnabled("com.example.dis", ["tools"], ["read-only"]);
    host.registerPluginTab(40, "com.example.dis", "tab");
    expect(host.assertApiAllowed(40, "tools").pluginId).toBe("com.example.dis");
    host.setEnabled("com.example.dis", false);
    expect(host.resolveByWebContents(40)).toBeNull();
    expect(() => host.assertApiAllowed(40, "tools")).toThrow(PluginError);
  });

  it("revokes live tabs when the plugin is uninstalled", async () => {
    await installEnabled("com.example.unin", ["tools"], ["read-only"]);
    host.registerPluginTab(50, "com.example.unin", "tab");
    expect(host.resolveByWebContents(50)).not.toBeNull();
    host.uninstall("com.example.unin");
    expect(host.resolveByWebContents(50)).toBeNull();
  });

  it("refuses to register authority for a disabled/unknown plugin", async () => {
    const root = writePlugin("com.example.off", { apis: ["tools"] });
    await host.installFromDirectory(root); // installed but not enabled
    host.registerPluginTab(60, "com.example.off", "tab");
    expect(host.resolveByWebContents(60)).toBeNull();
  });
});

describe("entry url resolution", () => {
  it("only resolves an entry url for an enabled plugin", async () => {
    const root = writePlugin("com.example.url", { apis: ["tools"] });
    await host.installFromDirectory(root);
    await expect(host.resolveEntryUrl("com.example.url")).rejects.toMatchObject({
      code: "NOT_ENABLED",
    });
    host.approveGrants("com.example.url", { capabilities: [], apis: ["tools"] });
    host.setEnabled("com.example.url", true);
    const url = await host.resolveEntryUrl("com.example.url");
    expect(url.startsWith("file://")).toBe(true);
    expect(url.endsWith("index.html")).toBe(true);
  });
});
