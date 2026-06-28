---
title: Developer overview
description: How meith is built: an Electron workbench backed by a local tool runtime that the UI, CLI, plugins, and agents all share.
section: Developers
sectionOrder: 2
order: 10
slug: developers
---

# Developer overview

The main process is the authority for state and side effects. The renderer, CLI,
plugins, and agent runtime all reach application capabilities through the same
validated `ToolRegistry`.

That design keeps the app consistent: opening a tab from the UI, running
`meith open`, or letting an agent control a browser tab all go through the same
tool definition, validation, permission, logging, and persistence path.

## Packages

meith is a pnpm monorepo built from the desktop runtime packages plus the public
web app.

| Package | Role |
| --- | --- |
| `@meith/shared` | Zod schemas and inferred types for app state, tabs, projects, tools, agents, plugins, logs, settings, IDs, and result helpers. |
| `@meith/protocol` | Tool contracts, tool descriptors, NDJSON protocol messages, naming helpers, and public plugin bridge types. |
| `@meith/desktop` | Electron main/preload/renderer, services, tool registration, socket server, IPC, browser/terminal hosts, agents, plugins, storage, and packaging. |
| `@meith/cli` | Terminal client that discovers a running runtime and calls tools over the local socket. |
| `@meith/web` | Next.js documentation and marketing site under `apps/web`. |

## Authority model

The runtime is centered on `packages/desktop/src/main/bootstrap.ts`.
`bootstrap(userDataPath, options)` wires the services, registers tools, starts
the local socket server, writes config, publishes an instance record, hydrates
state, and returns the service container.

```text
Renderer IPC ─────┐
CLI socket ───────┤
Plugin bridge ────┤
Agent MCP bridge ─┼── ToolRegistry ── services ── app state / files / browser / processes
Internal calls ───┘
```

`ToolRegistry.call()` is the common choke point. It rejects unknown tools,
validates arguments with each tool's Zod schema, asks `PermissionService` to
authorize privileged calls, applies timeout and cancellation handling, passes an
abort signal and optional event emitter to the tool, normalizes returned values
into a `ToolResult`, and logs and audits every call.

## Development modes

```bash
# desktop app
pnpm dev

# renderer-only mock mode
pnpm dev:renderer

# headless main-process runtime
pnpm --filter @meith/desktop dev:headless

# full verification
pnpm check
```

## Reference

- [Architecture](/docs/developers/architecture)
- [Tool Protocol](/docs/developers/tool-protocol)
- [Adding Tools](/docs/developers/adding-tools)
- [Agent Runtime](/docs/developers/agent-runtime)
- [Plugin API](/docs/developers/plugin-api)
