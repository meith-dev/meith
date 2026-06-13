import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PROTOCOL_VERSION } from "@meith/protocol";
import type { InstanceRecord } from "@meith/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs } from "../args.js";
import { detectLaunchIntent, locateAppBinary, runLaunch } from "../launch.js";
import type { OutputMode } from "../output.js";

/** A command is "known" if it is one of these for the purposes of the test. */
const known = (name: string) =>
  ["open", "logs", "call", "tools", "app", "setup", "tabs"].includes(name);

describe("detectLaunchIntent", () => {
  it("treats a bare invocation as launching the app", () => {
    const parsed = parseArgs([]);
    expect(detectLaunchIntent(parsed, known)).toEqual({ kind: "app" });
  });

  it("treats `new` as a create intent with optional name", () => {
    expect(detectLaunchIntent(parseArgs(["new"]), known)).toEqual({
      kind: "new",
      name: undefined,
    });
    expect(detectLaunchIntent(parseArgs(["new", "my-app"]), known)).toEqual({
      kind: "new",
      name: "my-app",
    });
  });

  it("returns null for known commands", () => {
    expect(detectLaunchIntent(parseArgs(["open", "http://x"]), known)).toBeNull();
    expect(detectLaunchIntent(parseArgs(["tools"]), known)).toBeNull();
  });

  it("treats `.` as opening the resolved cwd", () => {
    const intent = detectLaunchIntent(parseArgs(["."]), known);
    expect(intent).toEqual({ kind: "open", path: resolve(".") });
  });

  it("treats absolute and ./ paths as open intents", () => {
    expect(detectLaunchIntent(parseArgs(["/tmp/foo"]), known)).toEqual({
      kind: "open",
      path: "/tmp/foo",
    });
    expect(detectLaunchIntent(parseArgs(["./sub"]), known)).toEqual({
      kind: "open",
      path: resolve("./sub"),
    });
  });

  it("treats an existing relative directory as an open intent", () => {
    const dir = mkdtempSync(join(tmpdir(), "meith-launch-"));
    try {
      const intent = detectLaunchIntent(parseArgs([dir]), known);
      expect(intent).toEqual({ kind: "open", path: resolve(dir) });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns null for an unknown non-path token", () => {
    expect(
      detectLaunchIntent(parseArgs(["definitely-not-a-path-xyz"]), known),
    ).toBeNull();
  });
});

describe("locateAppBinary", () => {
  it("honors MEITH_APP_BIN when the file exists", () => {
    const prev = process.env.MEITH_APP_BIN;
    // Point at a file we know exists (this test file's runtime: node).
    process.env.MEITH_APP_BIN = process.execPath;
    try {
      expect(locateAppBinary()).toBe(process.execPath);
    } finally {
      process.env.MEITH_APP_BIN = prev;
    }
  });

  it("ignores MEITH_APP_BIN when the file does not exist", () => {
    const prev = process.env.MEITH_APP_BIN;
    process.env.MEITH_APP_BIN = "/no/such/meith/binary";
    try {
      // Either undefined or some real packaged path; never the bogus value.
      expect(locateAppBinary()).not.toBe("/no/such/meith/binary");
    } finally {
      process.env.MEITH_APP_BIN = prev;
    }
  });
});

/**
 * A minimal fake runtime: a unix socket server that records the tool calls it
 * receives and replies with a success envelope so `ToolClient` resolves.
 */
function fakeRuntime(socketPath: string): {
  server: net.Server;
  calls: string[];
  ready: Promise<void>;
} {
  const calls: string[] = [];
  const server = net.createServer((socket) => {
    let buf = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buf += chunk;
      let nl: number;
      // biome-ignore lint/suspicious/noAssignInExpressions: line framing
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        const msg = JSON.parse(line) as {
          type: string;
          requestId?: string;
          toolName?: string;
        };
        if (msg.type === "tool_call") {
          calls.push(msg.toolName ?? "");
          socket.write(
            `${JSON.stringify({
              type: "tool_result",
              protocol: PROTOCOL_VERSION,
              requestId: msg.requestId,
              result: { ok: true, content: "done" },
            })}\n`,
          );
        }
      }
    });
  });
  const ready = new Promise<void>((res) => server.listen(socketPath, res));
  return { server, calls, ready };
}

describe("runLaunch target selection", () => {
  let home: string;
  let prevHome: string | undefined;
  const quiet: OutputMode = { json: false, quiet: true };

  beforeEach(() => {
    prevHome = process.env.MEITH_HOME;
    home = mkdtempSync(join(tmpdir(), "meith-launch-route-"));
    process.env.MEITH_HOME = home;
    mkdirSync(join(home, "instances"), { recursive: true });
  });

  afterEach(() => {
    process.env.MEITH_HOME = prevHome;
    rmSync(home, { recursive: true, force: true });
  });

  function writeInstance(rec: InstanceRecord): void {
    writeFileSync(
      join(home, "instances", `${rec.pid}.json`),
      JSON.stringify(rec),
      "utf8",
    );
  }

  it("routes an explicit --socket/--instance target instead of the newest instance", async () => {
    // Use short socket paths under tmp to stay within the OS sun_path limit.
    const sockA = join(tmpdir(), `mA-${process.pid}.sock`);
    const sockB = join(tmpdir(), `mB-${process.pid}.sock`);
    rmSync(sockA, { force: true });
    rmSync(sockB, { force: true });
    const a = fakeRuntime(sockA);
    const b = fakeRuntime(sockB);
    await Promise.all([a.ready, b.ready]);

    // Both records belong to this (live) test process; B is the newest.
    // We deliberately target the OLDER instance A explicitly.
    writeInstance({
      pid: process.pid,
      socketPath: sockB,
      userDataPath: join(home, "b"),
      appVersion: "0.0.0",
      startedAt: Date.now(),
      label: "b",
    });
    // A second record needs a distinct filename; use pid+1 but keep it "live"
    // by pointing at our own process is impossible (one file per pid). Instead
    // target A directly via explicit socket, which is the real regression path.
    try {
      await runLaunch(
        { kind: "open", path: home },
        { mode: quiet, socketPath: sockA, explicitTarget: true },
      );
      expect(a.calls).toEqual(["project_open"]);
      expect(b.calls).toEqual([]);
    } finally {
      a.server.close();
      b.server.close();
      rmSync(sockA, { force: true });
      rmSync(sockB, { force: true });
    }
  });

  it("falls back to the newest live instance when no explicit target is given", async () => {
    const sockNewest = join(tmpdir(), `mN-${process.pid}.sock`);
    rmSync(sockNewest, { force: true });
    const n = fakeRuntime(sockNewest);
    await n.ready;

    writeInstance({
      pid: process.pid,
      socketPath: sockNewest,
      userDataPath: join(home, "n"),
      appVersion: "0.0.0",
      startedAt: Date.now(),
      label: "n",
    });
    try {
      await runLaunch(
        { kind: "open", path: home },
        { mode: quiet, socketPath: sockNewest, explicitTarget: false },
      );
      expect(n.calls).toEqual(["project_open"]);
    } finally {
      n.server.close();
      rmSync(sockNewest, { force: true });
    }
  });
});
