import { describe, expect, it } from "vitest";
import {
  ClientMessageSchema,
  NdjsonParser,
  PROTOCOL_VERSION,
  ServerMessageSchema,
  commandToToolName,
  encodeMessage,
  toolNameToCommand,
} from "../index.js";

describe("ndjson framing", () => {
  it("encodes a message as a single newline-terminated frame and stamps the version", () => {
    const frame = encodeMessage({ type: "list_tools" });
    expect(frame.endsWith("\n")).toBe(true);
    expect(frame.indexOf("\n")).toBe(frame.length - 1);
    expect(JSON.parse(frame)).toEqual({ type: "list_tools", protocol: PROTOCOL_VERSION });
  });

  it("does not override an explicit protocol field", () => {
    const frame = encodeMessage({ type: "list_tools", protocol: 99 });
    expect(JSON.parse(frame).protocol).toBe(99);
  });

  it("splits multiple frames and buffers a partial trailing frame", () => {
    const parser = new NdjsonParser();
    const a = encodeMessage({ type: "list_tools" });
    const b = encodeMessage({ type: "tools_list", tools: [] });

    const half = Math.floor(b.length / 2);
    const first = parser.push(a + b.slice(0, half));
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ type: "list_tools" });

    const second = parser.push(b.slice(half));
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ type: "tools_list", tools: [] });
  });

  it("ignores blank lines between frames", () => {
    const parser = new NdjsonParser();
    const out = parser.push('\n\n{"type":"list_tools"}\n\n');
    expect(out).toEqual([{ type: "list_tools" }]);
  });

  it("does not throw on a malformed frame; reports it and keeps parsing", () => {
    const errors: string[] = [];
    const parser = new NdjsonParser((err) => errors.push(err.message));
    const out = parser.push('{bad json}\n{"type":"list_tools"}\n');
    expect(errors).toHaveLength(1);
    expect(out).toEqual([{ type: "list_tools" }]);
  });
});

describe("message schemas", () => {
  it("accepts a valid tool_call and defaults arguments/clientInfo", () => {
    const parsed = ClientMessageSchema.parse({
      type: "tool_call",
      requestId: "req_1",
      toolName: "get_tabs",
    });
    expect(parsed).toMatchObject({
      type: "tool_call",
      toolName: "get_tabs",
      arguments: {},
      clientInfo: { caller: "cli" },
    });
  });

  it("accepts a cancel_tool_call", () => {
    const parsed = ClientMessageSchema.parse({
      type: "cancel_tool_call",
      requestId: "req_9",
    });
    expect(parsed).toMatchObject({ type: "cancel_tool_call", requestId: "req_9" });
  });

  it("rejects an unknown message type", () => {
    expect(() => ClientMessageSchema.parse({ type: "nope" })).toThrow();
  });

  it("validates a tool_result envelope response", () => {
    expect(() =>
      ServerMessageSchema.parse({
        type: "tool_result",
        requestId: "req_1",
        result: { ok: true, content: { foo: 1 } },
      }),
    ).not.toThrow();
  });

  it("validates a streaming tool_event response", () => {
    const parsed = ServerMessageSchema.parse({
      type: "tool_event",
      requestId: "req_1",
      event: { kind: "progress", message: "half", fraction: 0.5 },
    });
    expect(parsed.type).toBe("tool_event");
  });

  it("defaults an error response code to PROTOCOL_ERROR", () => {
    const parsed = ServerMessageSchema.parse({ type: "error", message: "boom" });
    expect(parsed).toMatchObject({ type: "error", code: "PROTOCOL_ERROR" });
  });
});

describe("naming conventions", () => {
  it("round-trips between kebab commands and snake tool names", () => {
    expect(commandToToolName("open-browser-tab")).toBe("open_browser_tab");
    expect(toolNameToCommand("open_browser_tab")).toBe("open-browser-tab");
    expect(toolNameToCommand(commandToToolName("get-tabs"))).toBe("get-tabs");
  });
});
