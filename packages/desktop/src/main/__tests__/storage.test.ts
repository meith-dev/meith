import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppStateService } from "../services/AppStateService.js";
import { Logger } from "../services/Logger.js";
import { JsonStore } from "../storage/JsonStore.js";
import { JsonlStore } from "../storage/JsonlStore.js";
import { atomicWriteFileSync, readJsonSafe } from "../storage/atomic.js";
import { CURRENT_STATE_VERSION, migrateAppState } from "../storage/migrations.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "meith-storage-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("migrations", () => {
  it("migrates legacy unversioned state up to current and validates", () => {
    const migrated = migrateAppState({
      spaces: [],
      activeSpaceId: null,
      browserTabs: [],
    });
    expect(migrated.version).toBe(CURRENT_STATE_VERSION);
    expect(migrated.workspaceTabs).toEqual([]);
  });

  it("passes through a valid current-version state", () => {
    const valid = {
      version: CURRENT_STATE_VERSION,
      spaces: [{ id: "s1", name: "S", projectId: null, createdAt: 1 }],
      activeSpaceId: "s1",
      browserTabs: [],
      workspaceTabs: [],
      projects: [],
      workspaceFileEvents: [],
      plugins: [],
      settings: {
        autoRunOnOpen: false,
        confirmOnClose: true,
        stopServersOnClose: true,
        showOutputOnRun: true,
        defaultPackageManager: "unknown",
        debugMode: false,
      },
    };
    expect(migrateAppState(valid).activeSpaceId).toBe("s1");
  });

  it("migrates v1 -> current by backfilling browser tab runtime fields", () => {
    const v1 = {
      version: 1,
      spaces: [{ id: "s1", name: "S", createdAt: 1 }],
      activeSpaceId: "s1",
      browserTabs: [
        { id: "t1", spaceId: "s1", url: "https://x.test", title: "X", createdAt: 1 },
      ],
      workspaceTabs: [],
    };
    const migrated = migrateAppState(v1);
    expect(migrated.version).toBe(CURRENT_STATE_VERSION);
    const tab = migrated.browserTabs[0];
    expect(tab.loadState).toBe("idle");
    expect(tab.canGoBack).toBe(false);
    expect(tab.canGoForward).toBe(false);
    expect(tab.ownerId).toBeNull();
  });

  it("migrates v2 -> current by adding an empty projects collection", () => {
    const v2 = {
      version: 2,
      spaces: [{ id: "s1", name: "S", createdAt: 1 }],
      activeSpaceId: "s1",
      browserTabs: [],
      workspaceTabs: [],
    };
    const migrated = migrateAppState(v2);
    expect(migrated.version).toBe(CURRENT_STATE_VERSION);
    expect(migrated.projects).toEqual([]);
  });

  it("migrates v3 -> v4 by adding global settings and per-project runConfig", () => {
    const v3 = {
      version: 3,
      spaces: [{ id: "s1", name: "S", createdAt: 1, projectId: "p1" }],
      activeSpaceId: "s1",
      browserTabs: [],
      workspaceTabs: [],
      projects: [
        {
          id: "p1",
          name: "Proj",
          cwd: "/tmp/proj",
          framework: "unknown",
          packageManager: "unknown",
          scripts: [],
          browserTabIds: [],
          workspaceTabIds: [],
          createdAt: 1,
          lastOpenedAt: 1,
        },
      ],
    };
    const migrated = migrateAppState(v3);
    expect(migrated.version).toBe(CURRENT_STATE_VERSION);
    // Global settings exist with sensible defaults.
    expect(migrated.settings.confirmOnClose).toBe(true);
    expect(migrated.settings.showOutputOnRun).toBe(true);
    expect(migrated.settings.debugMode).toBe(false);
    // Every project gains an empty run configuration.
    expect(migrated.projects[0].runConfig).toEqual({
      commands: [],
      defaultCommandId: null,
      env: {},
    });
  });

  it("migrates v4 -> v5 by preserving selected diff file state", () => {
    const v4 = {
      version: 4,
      spaces: [{ id: "s1", name: "S", createdAt: 1, projectId: null }],
      activeSpaceId: "s1",
      browserTabs: [],
      workspaceTabs: [
        {
          id: "w1",
          spaceId: "s1",
          title: "Diff",
          cwd: "/tmp/proj",
          kind: "diff",
          selectedDiffFilePath: "src/app.ts",
          active: true,
          createdAt: 1,
        },
      ],
      projects: [],
      workspaceFileEvents: [],
      plugins: [],
      settings: {
        autoRunOnOpen: false,
        confirmOnClose: true,
        stopServersOnClose: true,
        showOutputOnRun: true,
        defaultPackageManager: "unknown",
        debugMode: false,
      },
    };

    const migrated = migrateAppState(v4);

    expect(migrated.version).toBe(CURRENT_STATE_VERSION);
    expect(migrated.workspaceTabs[0].selectedDiffFilePath).toBe("src/app.ts");
  });

  it("throws on a newer-than-supported version", () => {
    expect(() => migrateAppState({ version: 99 })).toThrow();
  });

  it("throws when a versioned state fails validation", () => {
    expect(() => migrateAppState({ version: 1, spaces: "nope" })).toThrow();
  });
});

describe("atomic writes", () => {
  it("writes durably and leaves no temp files behind", () => {
    const path = join(dir, "a.json");
    atomicWriteFileSync(path, JSON.stringify({ hello: "world" }));
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ hello: "world" });
    expect(readdirSync(dir).some((f) => f.endsWith(".tmp"))).toBe(false);
  });

  it("readJsonSafe backs up a corrupt file and reports corruption", () => {
    const path = join(dir, "b.json");
    writeFileSync(path, "{ not valid json", "utf8");
    const result = readJsonSafe(path, (raw) => raw);
    expect(result.corrupt).toBe(true);
    expect(result.value).toBeNull();
    expect(result.backupPath && existsSync(result.backupPath)).toBe(true);
  });
});

describe("JsonStore", () => {
  it("persists synchronously when debounce is 0 and reloads", () => {
    const path = join(dir, "store.json");
    const a = new JsonStore<{ n: number }>({
      path,
      parse: (raw) => raw as { n: number },
      defaults: () => ({ n: 0 }),
      debounceMs: 0,
    });
    a.set({ n: 42 });
    const b = new JsonStore<{ n: number }>({
      path,
      parse: (raw) => raw as { n: number },
      defaults: () => ({ n: 0 }),
      debounceMs: 0,
    });
    expect(b.get().n).toBe(42);
  });

  it("resets to defaults and reports corruption", () => {
    const path = join(dir, "store.json");
    writeFileSync(path, "broken", "utf8");
    let backup: string | undefined = "unset";
    const store = new JsonStore<{ n: number }>({
      path,
      parse: (raw) => raw as { n: number },
      defaults: () => ({ n: 7 }),
      debounceMs: 0,
      onCorruption: (b) => {
        backup = b;
      },
    });
    expect(store.get().n).toBe(7);
    expect(backup).not.toBe("unset");
  });
});

describe("JsonlStore", () => {
  it("appends and tails the most recent records", () => {
    const path = join(dir, "log.jsonl");
    const store = new JsonlStore<{ i: number }>({
      path,
      parse: (r) => r as { i: number },
    });
    for (let i = 0; i < 10; i++) store.append({ i });
    expect(store.tail(3).map((r) => r.i)).toEqual([7, 8, 9]);
  });

  it("compacts when growth exceeds the threshold", () => {
    const path = join(dir, "log.jsonl");
    const store = new JsonlStore<{ i: number }>({
      path,
      parse: (r) => r as { i: number },
      maxRecords: 10,
      compactFactor: 1.5,
    });
    for (let i = 0; i < 40; i++) store.append({ i });
    const all = store.readAll();
    expect(all.length).toBeLessThanOrEqual(15);
    // Keeps the newest record.
    expect(all.at(-1)?.i).toBe(39);
  });

  it("skips malformed lines", () => {
    const path = join(dir, "log.jsonl");
    writeFileSync(path, '{"i":1}\nnot json\n{"i":2}\n', "utf8");
    const store = new JsonlStore<{ i: number }>({
      path,
      parse: (r) => r as { i: number },
    });
    expect(store.readAll().map((r) => r.i)).toEqual([1, 2]);
  });
});

describe("AppStateService persistence", () => {
  it("survives a simulated restart", () => {
    const path = join(dir, "state.json");
    const a = new AppStateService(path, new Logger(), 0);
    const spaceId = a.getState().activeSpaceId as string;
    a.update((draft) => {
      draft.browserTabs.push({
        id: "tab1",
        spaceId,
        url: "http://localhost:3000",
        title: "Dev",
        active: true,
        createdAt: Date.now(),
        loadState: "idle",
        mode: "web",
        canGoBack: false,
        canGoForward: false,
        ownerId: null,
      });
    });
    a.flush();

    const b = new AppStateService(path, new Logger(), 0);
    expect(b.getState().browserTabs.map((t) => t.id)).toContain("tab1");
  });

  it("recovers from a corrupt state file", () => {
    const path = join(dir, "state.json");
    writeFileSync(path, "{ corrupt", "utf8");
    const svc = new AppStateService(path, new Logger(), 0);
    // ensureDefaultSpace still gives a usable state.
    expect(svc.getState().spaces.length).toBe(1);
    expect(readdirSync(dir).some((f) => f.includes("corrupt"))).toBe(true);
  });
});
