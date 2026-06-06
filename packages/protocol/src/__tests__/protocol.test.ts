import { describe, it, expect } from "vitest";
import {
  NdjsonParser,
  encodeMessage,
  ClientMessageSchema,
  ServerMessageSchema,
  commandToToolName,
  toolNameToCommand,
} from "../index.js";

describe("ndjson framing", () => {
  it("encodes a message as a single newline-terminated frame", () => {
    const frame = encodeMessage({ type: "list_tools" });
    expect(frame.endsWith("\n")).toBe(true);
    expect(frame.indexOf("\n")).toBe(frame.length - 1);
    expect(JSON.parse(frame)).toEqual({ type: "list_tools" });
  });

  it("splits multiple frames and buffers a partial trailing frame", () => {
    const parser = new NdjsonParser();
    const a = encodeMessage({ type: "list_tools" });
    const b = encodeMessage({ type: "tools_list", tools: [] });

    // Feed a + half of b.
    const half = Math.floor(b.length / 2);
    const first = parser.push(a + b.slice(0, half));
    expect(first).toHaveLength(1);
    expect(first[0]).toEqual({ type: "list_tools" });

    // Feed the rest of b.
    const second = parser.push(b.slice(half));
    expect(second).toHaveLength(1);
    expect(second[0]).toEqual({ type: "tools_list", tools: [] });
  });

  it("ignores blank lines between frames", () => {
    const parser = new NdjsonParser();
    const out = parser.push('\n\n{"type":"list_tools"}\n\n');
    expect(out).toEqual([{ type: "list_tools" }]);
  });
});

describe("message schemas", () => {
  it("accepts a valid tool_call and defaults arguments/context", () => {
    const parsed = ClientMessageSchema.parse({
      type: "tool_call",
      requestId: "req_1",
      toolName: "get_tabs",
    });
    expect(parsed).toMatchObject({
      type: "tool_call",
      toolName: "get_tabs",
      arguments: {},
      context: {},
    });
  });

  it("rejects an unknown message type", () => {
    expect(() => ClientMessageSchema.parse({ type: "nope" })).toThrow();
  });

  it("validates server responses", () => {
    expect(() =>
      ServerMessageSchema.parse({
        type: "tool_result",
        requestId: "req_1",
        result: { ok: true },
      }),
    ).not.toThrow();
  });
});

describe("naming conventions", () => {
  it("round-trips between kebab commands and snake tool names", () => {
    expect(commandToToolName("open-browser-tab")).toBe("open_browser_tab");
    expect(toolNameToCommand("open_browser_tab")).toBe("open-browser-tab");
    expect(toolNameToCommand(commandToToolName("get-tabs"))).toBe("get-tabs");
  });
});
