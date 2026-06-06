import { describe, expect, it } from "vitest";
import {
  AppStateSchema,
  MeithConfigSchema,
  ToolResultSchema,
  createId,
  defaultAppState,
  errorResult,
  isToolResult,
  newRequestId,
  okResult,
} from "../index.js";

describe("id helpers", () => {
  it("creates prefixed ids", () => {
    expect(createId("tab")).toMatch(/^tab_[0-9a-f]{12}$/);
    expect(newRequestId()).toMatch(/^req_[0-9a-f]{12}$/);
  });

  it("creates unique ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => createId("x")));
    expect(ids.size).toBe(200);
  });
});

describe("state schemas", () => {
  it("defaultAppState satisfies AppStateSchema", () => {
    expect(() => AppStateSchema.parse(defaultAppState())).not.toThrow();
  });

  it("MeithConfigSchema requires socketPath + userDataPath", () => {
    expect(() =>
      MeithConfigSchema.parse({ userDataPath: "/tmp/x", socketPath: "/tmp/x/tool.sock" }),
    ).not.toThrow();
    expect(() => MeithConfigSchema.parse({ socketPath: "/tmp/x" })).toThrow();
  });
});

describe("tool result envelope", () => {
  it("okResult builds a valid success envelope", () => {
    const result = okResult({ hello: "world" }, { meta: { took: 1 } });
    expect(result.ok).toBe(true);
    expect(result.content).toEqual({ hello: "world" });
    expect(() => ToolResultSchema.parse(result)).not.toThrow();
  });

  it("errorResult builds a valid failure envelope", () => {
    const result = errorResult("VALIDATION_ERROR", "bad input", { field: "url" });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(() => ToolResultSchema.parse(result)).not.toThrow();
  });

  it("isToolResult distinguishes envelopes from raw values", () => {
    expect(isToolResult(okResult(1))).toBe(true);
    expect(isToolResult({ foo: "bar" })).toBe(false);
    expect(isToolResult([1, 2, 3])).toBe(false);
    expect(isToolResult(null)).toBe(false);
  });

  it("rejects an invalid error code", () => {
    expect(() =>
      ToolResultSchema.parse({ ok: false, error: { code: "NOPE", message: "x" } }),
    ).toThrow();
  });
});
