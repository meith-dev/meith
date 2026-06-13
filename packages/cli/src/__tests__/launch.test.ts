import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../args.js";
import { detectLaunchIntent, locateAppBinary } from "../launch.js";

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
