import { describe, it, expect } from "vitest";
import { parseArgs, coerce, buildParams } from "../args.js";
import { commands } from "../commands.js";

describe("parseArgs", () => {
  it("parses a command, positionals and flags", () => {
    const parsed = parseArgs(["open", "http://localhost:3000", "--title", "Dev"]);
    expect(parsed.command).toBe("open");
    expect(parsed.positionals).toEqual(["http://localhost:3000"]);
    expect(parsed.flags).toEqual({ title: "Dev" });
  });

  it("supports --flag=value and boolean flags", () => {
    const parsed = parseArgs(["logs", "--limit=50", "--json"]);
    expect(parsed.command).toBe("logs");
    expect(parsed.flags).toEqual({ limit: "50", json: true });
  });
});

describe("coerce", () => {
  it("coerces numbers and booleans but keeps strings", () => {
    expect(coerce("50")).toBe(50);
    expect(coerce("true")).toBe(true);
    expect(coerce("false")).toBe(false);
    expect(coerce("hello")).toBe("hello");
    expect(coerce(true)).toBe(true);
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
});

describe("command map", () => {
  it("every command points at a snake_case tool name", () => {
    for (const spec of Object.values(commands)) {
      expect(spec.tool).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
