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

Storage lives under `packages/desktop/src/main/storage/` and is split by access
pattern:

- **Small, bounded state** — `AppState` (spaces + tabs) is held by
  `AppStateService` and persisted to `state.json` through `JsonStore`, which
  writes **atomically** (temp file → `fsync` → rename) and **debounces** writes
  so rapid mutations don't thrash the disk.
- **Append-only history** — `Logger` appends structured entries to `logs.jsonl`
  through `JsonlStore`. Appends are single-line writes (never a full-file
  rewrite), and the file is **compacted** automatically once it grows past a
  threshold. The in-memory ring buffer is hydrated from disk on startup so logs
  survive a restart.

On load, raw JSON is run through a **migration system**
(`storage/migrations.ts`, `CURRENT_STATE_VERSION`) that upgrades older shapes to
the current version before Zod validation. A file that fails to parse/validate
is **backed up** to a `.corrupt-<ts>` sibling, a warning is logged, and the store
resets to defaults rather than crashing.

`StorageService` catalogs these collections and backs the read-only
`storage_list_collections`, `storage_read_collection`, and
`storage_export_state` tools so the CLI and agents can introspect persisted data.
`~/.meith/config.json` records the resolved `socketPath` so the CLI can find a
running runtime.

## Browser runtime

Browser tabs have two halves that stay in sync:

- **Tab records** (id, url, title, favicon, `loadState`, `canGoBack/Forward`,
  `ownerId`) live in persistent `AppState`, so the last-known state survives a
  restart.
- **Live views** live in a `BrowserViewHost` (`main/browser/`). The interface is
  injected so `bootstrap()` stays Electron-free: the desktop app passes an
  `ElectronBrowserViewHost` (real `WebContentsView`s), while tests/CLI/headless
  use the in-memory `HeadlessBrowserViewHost`.

`BrowserTabService` owns the lifecycle (open/navigate/back/forward/refresh/
focus/close), delegates live operations to the host, and merges the host's
`onNavStateChanged` callbacks back into the persisted record. Ordinary web
content loads with a minimal `preload/webContent.ts` bridge and **no Node
integration**. Screenshots go through `webContents.capturePage()` and are
persisted by `ArtifactStore` under `<userData>/artifacts/`.

**Rehydration.** Only tab *records* survive a restart, not live views. On
startup `bootstrap()` calls `BrowserTabService.hydrate()` to recreate views for
persisted tabs and focus the active one. As a safety net, `ensureView()` lazily
recreates a missing view before any navigate/back/forward/refresh/focus/capture,
so control never fails just because a view was lost.

**Viewport contract.** The renderer measures its browser content region
(`ResizeObserver` on `<main>`) and reports it to the main process over
`meith:browser:viewport` (validated by `BrowserViewportSchema`). The host's
`setContentBounds()` sizes the native view to that measured rectangle;
`getContentBounds` is only a fallback used before the first report. This avoids
the hard-coded inset drifting out of sync with the real layout. The window is
created **before** bootstrap, and `attachActiveView()` runs again on
`ready-to-show`, resolving the startup race where hydrate focuses a tab before
the window exists.

**Ownership.** A tab can be claimed with `browser_use_start` and released with
`browser_use_end`. Control is gated by a `ControlContext { ownerId, requireClaim }`:
automation callers (`agent`, `plugin`) set `requireClaim`, so they **must** claim
a tab before mutating it (unclaimed → `TabClaimRequiredError`); interactive
callers (`renderer`, `cli`) and `internal` may drive unclaimed tabs directly.
Controlling a tab owned by someone else throws `TabOwnershipError`. Both map to a
`PERMISSION_DENIED` tool error; `releaseOwner` frees all of a session's tabs on
shutdown/crash. Everything is exposed through the same tool registry, so the
renderer and `meith` CLI drive identical behavior (`meith open`, `navigate`,
`back`, `screenshot`, …).

**Automation & diagnostics.** The `BrowserViewHost` contract also covers the
agent-facing automation layer, again split between the Electron and headless
implementations:

- **DOM extraction** — `get_browser_state` returns the page's interactable
  elements with **stable ids** (`el-0`, `el-1`, …) plus role, label, text,
  value, bounds, and disabled/hidden flags, along with url/title/viewport. In
  Electron this is an injected page script that tags nodes with
  `data-meith-id`; the headless host models a small synthetic DOM so the
  contract is testable without a renderer. Ids are valid until the next
  extraction.
- **Interaction** — `click_element`, `type_text`, `scroll_page`, and
  `send_keys` operate on those ids. Electron drives them through injected JS and
  `sendInputEvent`; the headless host mutates its synthetic DOM. A stale/unknown
  id raises `ElementNotFoundError` → `TOOL_FAILED`. Interactions are control
  operations, so they honor the same claim/ownership rules as navigation.
- **Raw CDP** — `cdp_command` issues a Chrome DevTools Protocol command against
  the tab via `webContents.debugger` (attached per view on creation, detached on
  destroy). The headless host simulates a small CDP subset (`Page.navigate`,
  `Runtime.evaluate`, …).
- **Console & network** — the Electron host mines `Runtime.consoleAPICalled`,
  `Log.entryAdded`, and the `Network.*` events into per-tab ring buffers read by
  `get_console_logs` / `get_network_logs` (read-only). The headless host
  records synthetic entries on navigation/interaction.

## Related docs

- [TOOL_PROTOCOL.md](./TOOL_PROTOCOL.md) — the wire protocol and `ToolResult` envelope.
- [ADDING_TOOLS.md](./ADDING_TOOLS.md) — how to author a new tool.
- [AGENT_RUNTIME.md](./AGENT_RUNTIME.md) — how a future agent runtime plugs in.
- [PLUGIN_API.md](./PLUGIN_API.md) — the intended plugin surface.
