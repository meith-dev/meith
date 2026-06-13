import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InstanceRecord } from "@meith/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listLiveInstances, readInstances, resolveTarget } from "../instances.js";

let home: string;
let prevHome: string | undefined;

/** Write an instance record file under the temp MEITH_HOME/instances dir. */
function writeInstance(rec: Partial<InstanceRecord> & { pid: number }): void {
  const dir = join(home, "instances");
  mkdirSync(dir, { recursive: true });
  const socketPath = rec.socketPath ?? join(home, `sock-${rec.pid}`);
  // Ensure the socket "exists" so liveness checks pass.
  writeFileSync(socketPath, "");
  const full: InstanceRecord = {
    pid: rec.pid,
    socketPath,
    userDataPath: rec.userDataPath ?? join(home, `data-${rec.pid}`),
    appVersion: rec.appVersion ?? "1.2.3",
    startedAt: rec.startedAt ?? Date.now(),
    cwd: rec.cwd,
    label: rec.label,
  };
  writeFileSync(join(dir, `${rec.pid}.json`), JSON.stringify(full));
}

beforeEach(() => {
  prevHome = process.env.MEITH_HOME;
  home = mkdtempSync(join(tmpdir(), "meith-cli-test-"));
  process.env.MEITH_HOME = home;
});

afterEach(() => {
  process.env.MEITH_HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

describe("readInstances", () => {
  it("returns an empty list when no registry exists", () => {
    expect(readInstances()).toEqual([]);
  });

  it("ignores corrupt records", () => {
    const dir = join(home, "instances");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "bad.json"), "{not json");
    expect(readInstances()).toEqual([]);
  });
});

describe("listLiveInstances", () => {
  it("returns live instances newest-first", () => {
    // process.pid is guaranteed alive for the test runner.
    writeInstance({ pid: process.pid, label: "older", startedAt: 1000 });
    // A second record for the same live pid but newer.
    const dir = join(home, "instances");
    const socketPath = join(home, "sock-new");
    writeFileSync(socketPath, "");
    writeFileSync(
      join(dir, "alias.json"),
      JSON.stringify({
        pid: process.pid,
        socketPath,
        userDataPath: join(home, "data-new"),
        appVersion: "9.9.9",
        startedAt: 9000,
        label: "newer",
      }),
    );
    const live = listLiveInstances();
    expect(live.length).toBe(2);
    expect(live[0].label).toBe("newer");
  });

  it("excludes records whose process is dead", () => {
    // PID 1 exists, but a guaranteed-dead high pid should be filtered out.
    writeInstance({ pid: 2_147_483_600, label: "ghost" });
    expect(listLiveInstances()).toEqual([]);
  });
});

describe("resolveTarget", () => {
  it("prefers an explicit --socket override", () => {
    const t = resolveTarget({ socket: "/tmp/custom.sock" });
    expect(t).toEqual({ socketPath: "/tmp/custom.sock", source: "socket" });
  });

  it("matches --instance by pid", () => {
    writeInstance({ pid: process.pid, label: "main" });
    const t = resolveTarget({ instance: String(process.pid) });
    expect(t.source).toBe("instance");
    expect(t.instance?.pid).toBe(process.pid);
  });

  it("matches --instance by label", () => {
    writeInstance({ pid: process.pid, label: "studio" });
    const t = resolveTarget({ instance: "studio" });
    expect(t.source).toBe("instance");
  });

  it("throws when --instance matches nothing live", () => {
    expect(() => resolveTarget({ instance: "nope" })).toThrow(/No live instance/);
  });

  it("falls back to config.json when no instances are live", () => {
    writeFileSync(
      join(home, "config.json"),
      JSON.stringify({ userDataPath: home, socketPath: "/tmp/cfg.sock", version: 1 }),
    );
    const t = resolveTarget();
    expect(t).toEqual({ socketPath: "/tmp/cfg.sock", source: "config" });
  });

  it("falls back to the env default socket as a last resort", () => {
    const t = resolveTarget();
    expect(t.source).toBe("fallback");
    expect(t.socketPath).toContain("tool.sock");
  });

  it("chooses the newest live instance by default", () => {
    writeInstance({ pid: process.pid, label: "newest", startedAt: 5000 });
    const t = resolveTarget();
    expect(t.source).toBe("newest");
  });
});
