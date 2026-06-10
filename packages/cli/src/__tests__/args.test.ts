import { describe, expect, it } from "vitest";
import { buildParams, coerce, parseArgs } from "../args.js";
import { commands } from "../commands.js";

describe("parseArgs", () => {
  it("parses a command, positionals and flags", () => {
    const parsed = parseArgs(["open", "http://localhost:3000", "--title", "Dev"]);
    expect(parsed.command).toBe("open");
    expect(parsed.positionals).toEqual(["http://localhost:3000"]);
    expect(parsed.flags).toEqual({ title: "Dev" });
    expect(parsed.passthrough).toEqual([]);
  });

  it("supports --flag=value and boolean flags", () => {
    const parsed = parseArgs(["logs", "--limit=50", "--json"]);
    expect(parsed.command).toBe("logs");
    expect(parsed.flags).toEqual({ limit: "50", json: true });
  });

  it("parses --timeout and --verbose protocol flags", () => {
    const parsed = parseArgs(["call", "slow", "--timeout", "5000", "--verbose"]);
    expect(parsed.command).toBe("call");
    expect(parsed.positionals).toEqual(["slow"]);
    expect(parsed.flags).toEqual({ timeout: "5000", verbose: true });
  });

  it("captures --args as an array, including dash-prefixed values", () => {
    const parsed = parseArgs(["start-dev", "/tmp", "node", "--args", "-e", "0"]);
    expect(parsed.positionals).toEqual(["/tmp", "node"]);
    expect(parsed.flags).toEqual({ args: ["-e", "0"] });
  });

  it("captures -- passthrough arguments", () => {
    const parsed = parseArgs(["start-dev", "/tmp", "node", "--", "-e", "0"]);
    expect(parsed.positionals).toEqual(["/tmp", "node"]);
    expect(parsed.passthrough).toEqual(["-e", "0"]);
  });
});

describe("coerce", () => {
  it("coerces numbers and booleans but keeps strings", () => {
    expect(coerce("50")).toBe(50);
    expect(coerce("true")).toBe(true);
    expect(coerce("false")).toBe(false);
    expect(coerce("hello")).toBe("hello");
    expect(coerce(true)).toBe(true);
    expect(coerce(["1", "x"])).toEqual(["1", "x"]);
  });
});

describe("buildParams", () => {
  it("maps positionals to named slots and merges flags", () => {
    const parsed = parseArgs(["open", "http://localhost:3000", "--title", "Dev"]);
    const params = buildParams(parsed, commands.open.positionals);
    expect(params).toEqual({ url: "http://localhost:3000", title: "Dev" });
  });

  it("coerces a numeric flag for logs", () => {
    const parsed = parseArgs(["logs", "--limit", "120"]);
    const params = buildParams(parsed, commands.logs.positionals);
    expect(params).toEqual({ limit: 120 });
  });

  it("builds start-dev args as an array", () => {
    const parsed = parseArgs(["start-dev", "/tmp", "node", "--args", "-e", "0"]);
    const params = buildParams(parsed, commands["start-dev"].positionals);
    expect(params).toEqual({ cwd: "/tmp", command: "node", args: ["-e", "0"] });
  });
});

describe("command map", () => {
  it("every command points at a snake_case tool name", () => {
    for (const spec of Object.values(commands)) {
      expect(spec.tool).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
