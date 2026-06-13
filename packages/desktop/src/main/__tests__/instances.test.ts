import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolClient } from "@meith/cli/client";
import { InstanceRecordSchema } from "@meith/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrap, cleanupStaleInstances } from "../bootstrap.js";

let home: string;
let userData: string;
let generatedRoot: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "meith-home-"));
  userData = mkdtempSync(join(tmpdir(), "meith-data-"));
  generatedRoot = mkdtempSync(join(tmpdir(), "meith-generated-"));
  process.env.MEITH_HOME = home;
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(userData, { recursive: true, force: true });
  rmSync(generatedRoot, { recursive: true, force: true });
  process.env.MEITH_HOME = undefined;
});

describe("instance registry", () => {
  it("registers this instance on boot and removes it on shutdown", async () => {
    const container = await bootstrap(userData, {
      generatedProjectsRoot: generatedRoot,
      appVersion: "4.5.6",
      instanceLabel: "test-instance",
    });

    const file = join(home, "instances", `${process.pid}.json`);
    expect(existsSync(file)).toBe(true);
    const record = InstanceRecordSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    expect(record.pid).toBe(process.pid);
    expect(record.appVersion).toBe("4.5.6");
    expect(record.label).toBe("test-instance");
    expect(record.socketPath).toBe(container.config.socketPath);

    await container.shutdown();
    expect(existsSync(file)).toBe(false);
  });

  it("reaps stale instance records whose process is gone", async () => {
    // Pre-seed a record for a definitely-dead pid; boot should reap it.
    const dir = join(home, "instances");
    mkdirSync(dir, { recursive: true });
    const stale = join(dir, "2147483600.json");
    writeFileSync(
      stale,
      JSON.stringify({
        pid: 2_147_483_600,
        socketPath: join(home, "dead.sock"),
        userDataPath: userData,
        appVersion: "0.0.0",
        startedAt: Date.now(),
      }),
    );

    const container = await bootstrap(userData, { generatedProjectsRoot: generatedRoot });
    expect(existsSync(stale)).toBe(false);
    await container.shutdown();
  });

  it("cleanupStaleInstances returns only live records", () => {
    const dir = join(home, "instances");
    mkdirSync(dir, { recursive: true });
    const liveSock = join(home, "live.sock");
    writeFileSync(liveSock, "");
    writeFileSync(
      join(dir, `${process.pid}.json`),
      JSON.stringify({
        pid: process.pid,
        socketPath: liveSock,
        userDataPath: userData,
        appVersion: "1.0.0",
        startedAt: Date.now(),
      }),
    );
    writeFileSync(
      join(dir, "2147483600.json"),
      JSON.stringify({
        pid: 2_147_483_600,
        socketPath: join(home, "missing.sock"),
        userDataPath: userData,
        appVersion: "1.0.0",
        startedAt: Date.now(),
      }),
    );

    const live = cleanupStaleInstances(dir);
    expect(live.length).toBe(1);
    expect(live[0].pid).toBe(process.pid);
  });
});

describe("app_screenshot tool", () => {
  it("captures the window and persists a PNG artifact when supported", async () => {
    // A 1x1 PNG is enough to exercise the capture → artifact path.
    const fakePng = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
      "hex",
    );
    const container = await bootstrap(userData, {
      generatedProjectsRoot: generatedRoot,
      captureAppWindow: async () => fakePng,
    });
    const client = new ToolClient({ socketPath: container.config.socketPath });
    await client.connect();
    try {
      const result = await client.callTool("app_screenshot", {});
      expect(result.ok).toBe(true);
      const content = result.content as { bytes: number; path?: string };
      expect(content.bytes).toBe(fakePng.byteLength);
      expect(typeof content.path).toBe("string");
      expect(existsSync(content.path as string)).toBe(true);
    } finally {
      client.close();
      await container.shutdown();
    }
  });

  it("fails clearly when no window is available (headless)", async () => {
    const container = await bootstrap(userData, { generatedProjectsRoot: generatedRoot });
    const client = new ToolClient({ socketPath: container.config.socketPath });
    await client.connect();
    try {
      const result = await client.callTool("app_screenshot", {});
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("TOOL_FAILED");
    } finally {
      client.close();
      await container.shutdown();
    }
  });
});
