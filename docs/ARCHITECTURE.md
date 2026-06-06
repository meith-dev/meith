# Architecture

meith is a pnpm monorepo for an extensible desktop AI IDE. The guiding principle:

> The desktop main process is the authority. The renderer UI, the CLI, plugins,
> and future AI agents all call the **same validated tool registry** instead of
> reaching into services directly.

## Packages

| Package            | Role                                                                          |
| ------------------ | ----------------------------------------------------------------------------- |
| `@meith/shared`    | Zod schemas + inferred types, IDs, app config/state, the `ToolResult` envelope, capability/error-code enums, and the `ToolContext`. |
| `@meith/protocol`  | The `ToolDefinition` contract, `defineTool`, serializable `ToolDescriptor`, the newline-delimited JSON (ndjson) wire messages, and naming helpers. |
| `@meith/desktop`   | Electron main/preload/renderer, the service container, the single `ToolRegistry`, the local Unix-socket server, IPC handlers, and a React debug UI. |
| `@meith/cli`       | The `meith` terminal command. Connects to the running runtime's socket and calls registered tools. |

## The single tool registry

Tools are defined under `packages/desktop/src/main/tools/` and registered in
`bootstrap.ts`. Every caller reaches them through the same `ToolRegistry.call()`:

```
            ┌─────────────────────────────────────────────┐
            │            main process (authority)          │
            │                                              │
  CLI  ───▶ │  ToolSocketService ─┐                        │
            │                     ├─▶  ToolRegistry  ─▶ services
 renderer ─▶│  IPC handlers ──────┘        ▲               │
            │                              │               │
 agent  ───▶│  (future) AgentRuntime ──────┘               │
 plugin ───▶│  (future) PluginHost  ───────┘               │
            └─────────────────────────────────────────────┘
```

`ToolRegistry.call()` validates input against the tool's Zod schema, enforces a
timeout, supports cooperative cancellation (`AbortSignal`), lets tools stream
events, and always returns a structured `ToolResult` envelope.

## Boot path (no Electron required)

`bootstrap(userDataPath)` wires every service, registers tools, writes
`~/.meith/config.json`, and starts the socket server. It deliberately does **not**
import Electron, so:

- the real Electron `main` process calls it after `app.whenReady()`,
- the **headless harness** (`pnpm dev:headless`) calls it directly, and
- **tests** and the **CI smoke test** call it directly.

This is why the integration test and `scripts/smoke.mts` can exercise the full
socket + CLI path without a display.

## Persistence

`AppStateService` persists `AppState` (spaces + tabs) to `state.json` under the
user data directory. `~/.meith/config.json` records the resolved `socketPath` so
the CLI can find a running runtime. See [TODO.md](../TODO.md) Phase 2 for the
planned migration/storage work.

## Related docs

- [TOOL_PROTOCOL.md](./TOOL_PROTOCOL.md) — the wire protocol and `ToolResult` envelope.
- [ADDING_TOOLS.md](./ADDING_TOOLS.md) — how to author a new tool.
- [AGENT_RUNTIME.md](./AGENT_RUNTIME.md) — how a future agent runtime plugs in.
- [PLUGIN_API.md](./PLUGIN_API.md) — the intended plugin surface.
