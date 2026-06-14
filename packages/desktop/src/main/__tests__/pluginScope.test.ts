import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { navInPluginScope, pluginScopeFor } from "../browser/pluginScope.js";

describe("plugin authority scope (containment policy)", () => {
  describe("dev-url (origin) plugins", () => {
    const scope = pluginScopeFor("http://localhost:5180/app");

    it("binds to the origin, not the path", () => {
      expect(scope).toEqual({ kind: "origin", origin: "http://localhost:5180" });
    });

    it("stays in scope for same-origin navigation (incl. deep paths)", () => {
      expect(navInPluginScope(scope, "http://localhost:5180/app/settings")).toBe(true);
      expect(navInPluginScope(scope, "http://localhost:5180/")).toBe(true);
    });

    it("leaves scope for a different origin", () => {
      expect(navInPluginScope(scope, "http://evil.test/app")).toBe(false);
      expect(navInPluginScope(scope, "https://localhost:5180/app")).toBe(false);
      expect(navInPluginScope(scope, "http://localhost:5181/app")).toBe(false);
    });

    it("rejects a file:// navigation (opaque 'null' origin)", () => {
      expect(navInPluginScope(scope, "file:///etc/passwd")).toBe(false);
    });
  });

  describe("local-dir (file) plugins", () => {
    let dir: string;
    let entry: string;
    let entryUrl: string;

    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "meith-scope-"));
      entry = join(dir, "index.html");
      writeFileSync(entry, "<!doctype html>");
      writeFileSync(join(dir, "other.html"), "<!doctype html>");
      entryUrl = pathToFileURL(entry).toString();
    });

    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it("binds to the realpath of the entry file", () => {
      const scope = pluginScopeFor(entryUrl);
      // pluginScopeFor stores realpathSync(entry); on macOS the temp dir
      // resolves through a symlink (/var -> /private/var), so compare against
      // the realpath rather than the raw mkdtemp path.
      expect(scope).toEqual({ kind: "file", filePath: realpathSync(entry) });
    });

    it("stays in scope for hash/query routing on the same file", () => {
      const scope = pluginScopeFor(entryUrl);
      expect(navInPluginScope(scope, `${entryUrl}#/settings`)).toBe(true);
      expect(navInPluginScope(scope, `${entryUrl}?tab=2`)).toBe(true);
    });

    it("leaves scope for a SIBLING file in the same directory", () => {
      // The core bug: file:// origin is "null", so an origin check would allow
      // this. Binding to the entry file path must reject it.
      const scope = pluginScopeFor(entryUrl);
      const sibling = pathToFileURL(join(dir, "other.html")).toString();
      expect(navInPluginScope(scope, sibling)).toBe(false);
    });

    it("leaves scope for an arbitrary out-of-root file", () => {
      const scope = pluginScopeFor(entryUrl);
      expect(navInPluginScope(scope, "file:///etc/passwd")).toBe(false);
    });

    it("rejects a symlink that resolves outside the entry (realpath check)", () => {
      const outside = join(dir, "..", "escape-target.html");
      writeFileSync(outside, "<!doctype html>");
      const link = join(dir, "link.html");
      symlinkSync(outside, link);
      const scope = pluginScopeFor(entryUrl);
      // Navigating to the symlink resolves (realpath) outside the entry file.
      expect(navInPluginScope(scope, pathToFileURL(link).toString())).toBe(false);
      rmSync(outside, { force: true });
    });

    it("rejects switching schemes to http", () => {
      const scope = pluginScopeFor(entryUrl);
      expect(navInPluginScope(scope, "http://localhost:5180/app")).toBe(false);
    });
  });
});
