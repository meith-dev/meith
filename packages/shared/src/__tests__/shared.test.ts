import { describe, it, expect } from "vitest";
import {
  createId,
  newRequestId,
  AppStateSchema,
  AideConfigSchema,
  defaultAppState,
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

  it("AideConfigSchema requires socketPath + userDataPath", () => {
    expect(() =>
      AideConfigSchema.parse({ userDataPath: "/tmp/x", socketPath: "/tmp/x/tool.sock" }),
    ).not.toThrow();
    expect(() => AideConfigSchema.parse({ socketPath: "/tmp/x" })).toThrow();
  });
});
