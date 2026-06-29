---
title: Tool Protocol
description: The NDJSON socket protocol, ToolResult envelope, capabilities, caller identity, timeouts, and auditing model.
section: Developers
sectionOrder: 2
order: 30
slug: developers/tool-protocol
---

# Tool Protocol

meith exposes its tool registry over a local newline-delimited JSON socket. The
renderer uses Electron IPC, but it calls the same `ToolRegistry` and receives the
same `ToolResult` shape.

The protocol types live in:

- `packages/protocol/src/messages.ts`
- `packages/protocol/src/tools.ts`
- `packages/shared/src/schemas.ts`
- `packages/shared/src/types.ts`

## Transport

The socket protocol is NDJSON: each line is one complete JSON frame.

The runtime writes its socket path to `~/.meith/config.json` and also publishes
live instance records in `~/.meith/instances/`. The CLI uses those files to find
the target runtime unless `--socket` or `--instance` is provided.

Every message may include `protocol`. The current value is:

```ts
PROTOCOL_VERSION = 1
```

If a client sends a mismatched protocol version, the server returns a transport
`error` with `PROTOCOL_ERROR`.

Frames are capped by `MAX_FRAME_BYTES` in the NDJSON parser. Malformed frames are
reported and skipped rather than crashing the connection.

## Client Messages

### `list_tools`

Lists serializable tool descriptors.

```json
{
  "type": "list_tools",
  "protocol": 1,
  "clientInfo": { "caller": "cli" }
}
```

Response: `tools_list`.

### `tool_call`

Calls a registered tool.

```json
{
  "type": "tool_call",
  "protocol": 1,
  "requestId": "req_ab12cd34",
  "toolName": "open_browser_tab",
  "arguments": { "url": "http://localhost:3000" },
  "clientInfo": {
    "caller": "cli",
    "cwd": "/work/project",
    "spaceId": "space_1",
    "tabId": "btab_1"
  },
  "timeoutMs": 30000
}
```

Response stream:

- zero or more `tool_event` frames,
- one final `tool_result` frame.

### `cancel_tool_call`

Cancels an in-flight call by request id.

```json
{
  "type": "cancel_tool_call",
  "protocol": 1,
  "requestId": "req_ab12cd34"
}
```

Cancellation is cooperative. The registry aborts the call signal, and tools are
expected to observe `ctx.signal`. The registry still races execution against the
abort signal so a cancelled or timed-out call resolves with a structured failure
even if a tool does not observe the signal promptly.

## Server Messages

### `tools_list`

```json
{
  "type": "tools_list",
  "protocol": 1,
  "tools": [
    {
      "name": "open_browser_tab",
      "description": "Open a new browser tab pointing at a URL and focus it.",
      "inputSchema": {},
      "capabilities": ["controls-browser"]
    }
  ]
}
```

Tool descriptors are generated from registered `ToolDefinition`s. The
`inputSchema` is derived from each tool's Zod schema with `zod-to-json-schema`.

### `tool_event`

```json
{
  "type": "tool_event",
  "protocol": 1,
  "requestId": "req_ab12cd34",
  "event": {
    "kind": "progress",
    "message": "starting",
    "fraction": 0.1
  }
}
```

Event kinds:

- `progress`
- `log`
- `partial_text`
- `artifact`

The CLI prints progress and partial text in human-readable mode. `meith devlogs`
uses streamed `log` events from `attach_process_logs`.

### `tool_result`

Tool success and tool failure both use `tool_result`.

```json
{
  "type": "tool_result",
  "protocol": 1,
  "requestId": "req_ab12cd34",
  "result": {
    "ok": true,
    "content": { "id": "btab_123" }
  }
}
```

### `error`

Transport/protocol-level errors only.

```json
{
  "type": "error",
  "protocol": 1,
  "requestId": "req_ab12cd34",
  "code": "PROTOCOL_ERROR",
  "message": "Unsupported protocol version"
}
```

Do not use transport `error` for tool execution failures. Tool-level failures
belong inside `tool_result.result`.

## ToolResult

Every tool resolves to this envelope:

```ts
interface ToolResult<T = unknown> {
  ok: boolean;
  content?: T;
  meta?: Record<string, unknown>;
  diagnostics?: Array<{
    level: "info" | "warn" | "error";
    message: string;
  }>;
  error?: {
    code: ToolErrorCode;
    message: string;
    details?: unknown;
  };
}
```

Tools may return either a raw value or a full `ToolResult`.

- Raw values become `{ ok: true, content: value }`.
- `okResult()` and `errorResult()` create explicit envelopes.
- Throwing `ToolError` controls the returned error code.
- Any other throw becomes `TOOL_FAILED`.

Error codes:

- `UNKNOWN_TOOL`
- `VALIDATION_ERROR`
- `PERMISSION_DENIED`
- `TIMEOUT`
- `TOOL_FAILED`
- `RUNTIME_SHUTTING_DOWN`
- `CANCELLED`
- `PROTOCOL_ERROR`

## Capabilities

Each tool can declare safety metadata:

- `read-only`
- `writes-files`
- `controls-browser`
- `starts-process`
- `accesses-network`
- `destructive`

`PermissionService` treats these as authorization inputs. Renderer and internal
callers are trusted but audited. Socket, agent, and plugin callers are subject
to grants or approved plugin capabilities for privileged capabilities.

The current agent approval gate prompts for `writes-files`, `controls-browser`,
`starts-process`, and `destructive`. `accesses-network` remains part of the
declared capability model and audit trail, and plugins still need approved
capabilities that cover the tools they call.

## Diff Tool Shape

`git_diff` is the built-in read-only working-tree diff tool. It reports staged
and unstaged changes against `HEAD` plus untracked files:

```json
{
  "cwd": "/work/project",
  "includePatches": false
}
```

`includePatches: false` returns file status and line-count summaries without
patch bodies. The renderer uses that cheap summary for the top-bar diff chip and
polling. The diff tab then requests a selected file on demand:

```json
{
  "cwd": "/work/project",
  "includePatches": true,
  "path": "src/app/page.tsx"
}
```

This keeps large repositories responsive while preserving the same structured
tool result for the CLI, renderer, plugins, and agents.

## Caller Identity

`clientInfo` carries requested caller context:

```ts
{
  caller: "cli" | "renderer" | "agent" | "plugin" | "internal";
  cwd?: string;
  sessionId?: string;
  spaceId?: string;
  tabId?: string;
}
```

The socket is a local but untrusted boundary. `ToolSocketService` does not trust
security-relevant caller claims from socket peers:

- socket clients can assert `cli` or `plugin`,
- attempts to assert `renderer`, `agent`, or `internal` are downgraded,
- client-provided `sessionId` is replaced by a server-assigned per-connection
  id,
- `cwd`, `spaceId`, and `tabId` are passed through as scope hints.

This matters for browser automation ownership. A socket peer cannot choose a
session id to impersonate another owner.

Renderer IPC is in-process and trusted as `caller: "renderer"`.

Agents do not use the public socket for privileged identity. `AgentService`
calls the registry in-process and passes `caller: "agent"` with the real session
id. External ACP agents call through a per-session MCP bridge that maps bearer
tokens back to the same gated agent session.

Plugin calls are resolved from the sender webContents id. The plugin page never
supplies its own trusted identity.

### Deny-by-default for privileged callers

`PermissionService` applies a deny-by-default policy for every caller that is
not `renderer` or `internal`:

| Caller | Privileged tool without a grant | Read-only tool |
| --- | --- | --- |
| `renderer` | Allowed (trusted in-process) | Allowed |
| `internal` | Allowed (trusted in-process) | Allowed |
| `cli` | Denied unless session has a matching capability grant | Allowed |
| `agent` | Denied if no `sessionId` is present, or if the session has no matching capability grant | Allowed |
| `plugin` | Denied if the plugin id resolves to `null` grants, or the approved grants do not cover the required capability | Allowed |

Every call — allowed or denied — is written to `audit.jsonl`. Revoking a session
(`PermissionService.revokeSession`) immediately invalidates all grants for that
session; subsequent calls with the revoked session id receive `PERMISSION_DENIED`
even if the tool was previously allowed.

The test suite in `permission.test.ts` enforces these invariants directly:
renderer/internal trust, agent-without-session deny, plugin-with-null-grants
deny, plugin-with-empty-grants deny, and revoked-session deny are all covered
as explicit test cases.

## Timeouts

Timeout order:

1. `tool_call.timeoutMs`, if supplied,
2. the tool definition's `timeoutMs`, if supplied,
3. `DEFAULT_TOOL_TIMEOUT_MS`.

On expiry, the final result is:

```json
{
  "ok": false,
  "error": {
    "code": "TIMEOUT",
    "message": "Tool \"name\" timed out after 30000ms"
  }
}
```

Some tools intentionally override timeout. `attach_process_logs`, for example,
uses a very large timeout because it is designed to stream until the caller
cancels or disconnects.

## Auditing

Every registry call is logged and passed to `PermissionService.auditToolCall`.
Audit entries include caller, tool name, capabilities, decision, cwd, session,
space, tab, summarized arguments, summarized result, and duration.

Argument and result summaries redact likely secrets and large text payloads
before writing to `audit.jsonl`.
