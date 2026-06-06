# Tool Protocol

The runtime speaks **newline-delimited JSON (ndjson)** over a local Unix socket.
Each line is one complete JSON message. The same contract is mirrored over
Electron IPC for the renderer. Schemas live in `@meith/protocol` (wire messages)
and `@meith/shared` (the `ToolResult` envelope + enums).

## Versioning

Every message may carry a numeric `protocol` field. The current value is
`PROTOCOL_VERSION = 1` (exported from `@meith/protocol`). The server rejects a
message whose `protocol` is present and does not match, with a `PROTOCOL_ERROR`.

## Client → server messages

### `list_tools`
```json
{ "type": "list_tools", "protocol": 1, "clientInfo": { "caller": "cli" } }
```

### `tool_call`
```json
{
  "type": "tool_call",
  "protocol": 1,
  "requestId": "req_ab12cd34",
  "toolName": "open_browser_tab",
  "arguments": { "url": "http://localhost:3000" },
  "clientInfo": { "caller": "cli", "cwd": "/work", "sessionId": "sess_1" },
  "timeoutMs": 30000
}
```

### `cancel_tool_call`
```json
{ "type": "cancel_tool_call", "protocol": 1, "requestId": "req_ab12cd34" }
```

`clientInfo` identifies the caller (`cli` | `renderer` | `agent` | `plugin` |
`internal`) plus optional `cwd`, `sessionId`, `spaceId`, and `tabId`. It becomes
the tool's `ToolContext`.

## Server → client messages

### `tools_list`
```json
{ "type": "tools_list", "protocol": 1, "tools": [ { "name": "...", "description": "...", "inputSchema": {}, "capabilities": ["read-only"] } ] }
```

### `tool_event` (streaming, correlated by `requestId`)
```json
{ "type": "tool_event", "protocol": 1, "requestId": "req_ab12cd34", "event": { "kind": "progress", "fraction": 0.5, "message": "halfway" } }
```
Event kinds: `progress`, `log`, `partial_text`, `artifact`.

### `tool_result` (final, correlated by `requestId`)
```json
{ "type": "tool_result", "protocol": 1, "requestId": "req_ab12cd34", "result": { "ok": true, "content": { "id": "btab_..." } } }
```

### `error` (transport/protocol-level only)
```json
{ "type": "error", "protocol": 1, "requestId": "req_ab12cd34", "code": "PROTOCOL_ERROR", "message": "..." }
```

## The `ToolResult` envelope

Tool-level outcomes (success **and** failure) come back inside `tool_result`,
never as a transport `error`. The envelope:

```ts
interface ToolResult<T = unknown> {
  ok: boolean;
  content?: T;                    // present on success
  meta?: Record<string, unknown>; // optional structured metadata
  diagnostics?: { level: "info" | "warn" | "error"; message: string }[];
  error?: { code: ToolErrorCode; message: string; details?: unknown };
}
```

`transport error` messages are reserved for malformed frames, unknown message
types, and protocol-version mismatches.

## Error codes

`UNKNOWN_TOOL`, `VALIDATION_ERROR`, `PERMISSION_DENIED`, `TIMEOUT`,
`TOOL_FAILED`, `RUNTIME_SHUTTING_DOWN`, `CANCELLED`, `PROTOCOL_ERROR`.

## Capabilities (safety metadata)

Each tool declares `capabilities` so an agent/plugin host can make permission
decisions before calling:

`read-only`, `writes-files`, `controls-browser`, `starts-process`,
`accesses-network`, `destructive`.

## Timeout & cancellation

- A `tool_call` may set `timeoutMs`; otherwise the tool's own `timeoutMs` or the
  default (`DEFAULT_TOOL_TIMEOUT_MS`) applies. On expiry the result is
  `ok: false` with code `TIMEOUT`.
- `cancel_tool_call` aborts the in-flight call's `AbortSignal`; the result comes
  back as `ok: false` with code `CANCELLED`. Cancellation is cooperative — tools
  should observe `ctx.signal`.
