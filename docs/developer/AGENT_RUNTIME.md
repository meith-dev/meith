---
title: Agent Runtime
description: How meith runs provider-agnostic agent sessions behind the shared tool registry.
section: Developers
sectionOrder: 2
order: 50
slug: developers/agent-runtime
---

# Agent Runtime

The agent runtime is implemented in the desktop main process. It manages
sessions, transcripts, configuration, streaming output, permission prompts, and
adapter execution while keeping all app actions behind the shared tool registry.

The core files are:

- `packages/desktop/src/main/services/AgentService.ts`
- `packages/desktop/src/main/agent/types.ts`
- `packages/desktop/src/main/agent/systemPrompt.ts`
- `packages/desktop/src/main/agent/adapters/MockAdapter.ts`
- `packages/desktop/src/main/agent/adapters/AcpAdapter.ts`
- `packages/desktop/src/main/services/McpBridgeService.ts`
- `packages/desktop/src/renderer/src/components/AgentView.tsx`
- `packages/desktop/src/renderer/src/hooks/useAgent.ts`

## Goals

The runtime keeps provider-specific code out of the core app.

`AgentService` knows how to:

- create, hydrate, list, delete, and persist sessions,
- append messages,
- stream run chunks to the renderer,
- build a live system prompt from the registry and workspace context,
- enforce permissions before tool calls,
- cancel running sessions,
- expose per-session tools to an external agent through MCP,
- switch adapters based on persisted config.

Adapters know how to talk to a specific backend or protocol.

The composed system prompt includes the live registry catalog plus bounded
session context: cwd, space name, active editor file, selected diff file, open
browser tabs, terminal status, running dev-server URLs, recent browser console
errors, current git summary, and project instruction files discovered from the
session cwd (`AGENTS.md`, `.cursorrules`, `CLAUDE.md`, and GitHub Copilot
instructions). Prompt text also states precedence: app safety and tool schemas
win first, then the latest user request, then project instruction files with
more-specific files overriding broader ones.

## Session Model

An agent session contains:

- id,
- title,
- cwd,
- optional space id,
- optional model,
- adapter id,
- status,
- created/updated timestamps,
- messages.

`AgentStore` persists session metadata and messages. On startup,
`AgentService.hydrate()` loads stored sessions and resets any crash-left
`running` sessions back to `idle`.

The renderer shows sessions in `AgentView`: a resizable session list, transcript,
composer, stop button, and pending permission cards.

Session titles are generated from the first useful user request, capped to a
short title for the session list. `lastViewedAt` tracks whether a finished
session has unseen updates.

Transcripts are stored separately from the session index as per-session JSONL
records. Streaming text is appended as message patches, including optional text
segment kinds:

- `thought` for compact thinking/progress text,
- `message` for final assistant prose.

When transcript files grow past size or record-count thresholds, `AgentStore`
compacts them into message snapshots while preserving tool calls, usage, errors,
and text segments. This keeps long sessions resumable without making
`sessions.json` or renderer hydration expensive.

## Configuration

Agent config is stored by `AgentConfigStore` and edited in Settings.

Current config fields:

- `adapter`: `mock` or `acp`
- `acpPreset`: `claude`, `codex`, or `custom`
- `command`: custom ACP executable
- `args`: custom ACP arguments
- `model`: optional model string
- `reasoning`: optional effort/reasoning level
- `autoAccept`: whether gated tools run without prompting

The default adapter is `mock`, so the UI works without external setup.

When the adapter config changes, `bootstrap.ts` registers either:

- `MockAdapter`, or
- `AcpAdapter`.

## System Prompt

`buildSystemPrompt()` composes the prompt from:

- a static base prompt,
- the live tool catalog from `registry.describe()`,
- current session context such as cwd, space name, and open browser tabs,
- safety text reflecting whether auto-accept is enabled.

The tool list is never hardcoded. If a tool is registered, the agent prompt can
include it. If a tool is removed or renamed, the prompt changes with the
registry.

## Tool Calls and Permissions

Agents are just another registry caller, but not a trusted one.

`AgentService.gatedCall()` applies this policy:

- tools with no privileged capabilities run directly,
- tools with privileged capabilities prompt the user unless auto-accept is on or
  the decision was remembered,
- denied calls return `PERMISSION_DENIED`,
- approved calls write a one-use grant into `PermissionService`,
- the final call goes through `ToolRegistry.call()` with:

```ts
{
  caller: "agent",
  sessionId: session.id,
  cwd: session.cwd,
  spaceId: session.spaceId ?? undefined
}
```

Privileged capabilities are:

- `writes-files`
- `controls-browser`
- `starts-process`
- `destructive`

`accesses-network` is still declared and audited, but the current privileged
gate is focused on local side effects and destructive actions.

## Browser Ownership

Browser mutation tools enforce exclusive ownership for automation callers.

An agent should call `browser_use_start` before controlling a tab and
`browser_use_end` when done. The owner id is the trusted agent session id, so
another session cannot hijack the tab.

If an agent tries to mutate an unclaimed tab or a tab owned by another session,
the browser tools return `PERMISSION_DENIED`.

## Mock Adapter

`MockAdapter` is the built-in no-setup adapter. It is deterministic and useful
for exercising the session UI, streaming path, and permission surfaces without a
real model process.

Use it for development and tests where the agent backend itself is not under
test.

## ACP Adapter

`AcpAdapter` runs an external Agent Client Protocol subprocess over stdio.

Execution flow:

1. Resolve the configured preset or custom command.
2. Spawn the subprocess in the session cwd.
3. Initialize ACP with `protocolVersion: 1`.
4. Start the per-session MCP bridge if needed.
5. Register the current session with `McpBridgeService`, receiving a localhost
   URL and bearer token.
6. Send `session/new` with that MCP server in `mcpServers`.
7. Send `session/prompt` with the composed meith prompt and latest user message.
8. Map ACP `session/update` notifications into meith stream chunks.
9. Cancel by notifying `session/cancel`, killing the child process, and ending
   the stream.

ACP permission requests are allowed only when they reference a tool exposed by
the MCP server named `meith`. Requests for provider-native tools, external MCP
servers, or helper surfaces are denied at the ACP layer so they cannot bypass
`AgentService`, `PermissionService`, or browser ownership.

When an ACP agent advertises config options, meith applies the selected model
and reasoning level through `session/set_config_option`. If a text verbosity
option is available, meith sets it to low by default so streamed output stays
compact. Built-in Claude and Codex ACP presets also wait until the agent has
listed the per-session Meith MCP tools before the prompt is sent.

## MCP Bridge

`McpBridgeService` is a dependency-light local HTTP JSON-RPC server bound to
`127.0.0.1` on an ephemeral port.

Each agent session gets a unique bearer token. The token maps to a
`McpSessionBinding`:

```ts
{
  sessionId,
  listTools,
  callTool
}
```

Supported MCP-style methods:

- `initialize`
- `notifications/initialized`
- `notifications/cancelled`
- `ping`
- `tools/list`
- `tools/call`

`tools/call` maps the external request back into the session's gated tool call
function. This preserves the same permission, audit, and browser-ownership model
as in-process agent calls.

## Renderer Integration

IPC channels in `packages/desktop/src/main/ipc/handlers.ts` expose:

- list sessions,
- get a session,
- create a session,
- delete a session,
- send a message,
- cancel,
- resolve a permission decision,
- get/set agent config.

High-volume updates are pushed from main to renderer:

- `agentChunk` for streamed text, tool calls, errors, usage, and done chunks,
- `agentSession` for metadata/status updates,
- `agentPermission` for pending permission prompts.

## Plugin AI API

Plugins with the approved `ai` API can call:

```ts
window.meithPlugin.ai.streamText({ prompt, onStart, onText })
```

The host creates an ephemeral agent session, streams text chunks back to the
plugin tab, and deletes the session after completion. Plugin AI calls still run
through the agent runtime and cannot bypass the tool permission model.

## Operational Notes

- Agents are disposed on runtime shutdown.
- Deleting a session cancels it, disposes adapter state, unregisters its MCP
  binding, revokes session grants, and deletes persisted session data.
- `startIdleGc()` cleans idle session resources.
- Auto-accept should be treated as a high-trust setting because it lets gated
  tools run without prompting.
- The packaged desktop app stages a bundled Node/npm/npx runtime. Built-in ACP
  presets launch through that bundled `npx`, with npm cache/prefix directed at
  Meith-managed directories, so they do not require user-installed Node tooling.
  The ACP package may still be fetched from the npm registry on first use.
