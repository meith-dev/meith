# meith — Agentic Desktop IDE (scaffold)

> **meith** (from the Irish _meitheal_ — a gathering of neighbors who pool their
> labor to bring in a harvest or raise a structure together). The name fits the
> architecture: the Electron main process, the local CLI, the UI, and future AI
> agents all cooperate around one shared tool registry to do the heavy lifting.

A pnpm monorepo scaffold for an extensible desktop AI IDE. The core idea: every
capability is a **Tool** in a single registry, and that registry is reachable
identically from the renderer (Electron IPC), the CLI (local Unix socket), and —
later — an MCP server or an AI agent runtime.

```
┌─────────────┐   IPC    ┌────────────────────────┐
│  Renderer   │ ───────► │      Main process      │
│ (React UI)  │          │  ┌──────────────────┐  │
└─────────────┘          │  │  ToolRegistry    │  │
                         │  └──────────────────┘  │
┌─────────────┐  socket  │   ▲ services: state,   │
│     CLI     │ ───────► │   │ tabs, dev servers, │
│  (meith ...) │  ndjson  │   │ terminals, agents  │
└─────────────┘          └────────────────────────┘
```

## Packages

| Package           | What it is                                                        |
| ----------------- | ----------------------------------------------------------------- |
| `@meith/shared`    | Zod schemas, domain types (`AppState`, tabs, config), id helpers. |
| `@meith/protocol`  | Tool contract (`defineTool`), ndjson wire protocol, naming utils. |
| `@meith/desktop`   | Electron main + preload + React renderer, services, tool registry.|
| `@meith/cli`       | `meith` command — connects to the runtime socket and calls tools.  |

## Getting started

```bash
pnpm install
pnpm build           # builds libs, then desktop + cli
pnpm test            # runs every package's vitest suite
pnpm typecheck
```

### Run the desktop app

```bash
pnpm dev             # electron-vite dev (main + preload + renderer)
pnpm dev:renderer    # renderer only, in a plain browser (mock bridge)
```

The renderer ships a **debug control panel** (Tools / State / Logs) so you can
exercise every registered tool by hand. Outside Electron it falls back to an
in-memory mock bridge so the UI still runs in a normal browser.

### Run headless (no Electron) + drive it with the CLI

```bash
pnpm --filter @meith/desktop dev:headless   # boots services + socket server
```

In another terminal:

```bash
pnpm cli tools                         # list every tool
pnpm cli open http://localhost:3000    # open a browser tab
pnpm cli tabs                          # list tabs
pnpm cli state                         # dump persistent app state
pnpm cli logs --limit 50               # recent log lines
pnpm cli call get_tabs --json          # generic escape hatch to any tool
```

The CLI discovers the socket from `~/.meith/config.json` (written on boot), or
honors `--socket <path>` / `$MEITH_HOME`.

## How it fits together

1. **`bootstrap(userDataPath)`** (in `@meith/desktop`) wires every service, builds
   the `ToolRegistry`, writes `~/.meith/config.json`, and starts the socket server.
   It imports **no Electron**, so the same path runs in the headless harness and
   in tests.
2. **Tools** are defined with `defineTool({ name, description, inputSchema, execute })`.
   The Zod `inputSchema` gives runtime validation, static types, and JSON Schema
   for future agent function-calling / MCP.
3. **Callers** (CLI socket, renderer IPC) never touch services directly — they go
   through `registry.call(ctx, name, args)`, which validates input first.

## Adding a tool

```ts
// packages/desktop/src/main/tools/myTools.ts
import { z } from "zod";
import { defineTool } from "@meith/protocol";
import type { ToolDeps } from "./deps.js";

export function createMyTools(deps: ToolDeps) {
  return [
    defineTool({
      name: "say_hello",
      description: "Return a greeting.",
      inputSchema: z.object({ name: z.string() }),
      execute: (_ctx, input) => ({ message: `Hello, ${input.name}!` }),
    }),
  ];
}
```

Register it in `bootstrap.ts` (`registry.registerAll(createMyTools(deps))`). It is
now callable from the renderer, from `meith call say_hello --name World`, and from
any future agent — no extra plumbing.

## Status

This is a **scaffold**. Several tools (`take_screenshot`, `get_process_tree`,
`get_process_logs`) return structured placeholder results so callers can integrate
against the final shape before the implementations land. `AgentService` exposes the
runtime interface for a future model-driven loop. See `packages/desktop/prompts/system.md`.
