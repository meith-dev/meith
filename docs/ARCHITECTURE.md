# Architecture

meith is an Electron desktop workbench backed by a local tool runtime. The main
process is the authority for state and side effects. The renderer, CLI, plugins,
and agent runtime all reach application capabilities through the same validated
`ToolRegistry`.

That design keeps the app consistent: opening a tab from the UI, running
`meith open`, or letting an agent control a browser tab all go through the same
tool definition, validation, permission, logging, and persistence path.

## Packages

| Package | Role |
| --- | --- |
| `@meith/shared` | Zod schemas and inferred types for app state, tabs, projects, tools, agents, plugins, logs, settings, IDs, and result helpers. |
| `@meith/protocol` | Tool contracts, tool descriptors, NDJSON protocol messages, naming helpers, and public plugin bridge types. |
| `@meith/desktop` | Electron main/preload/renderer, services, tool registration, socket server, IPC, browser/terminal hosts, agents, plugins, storage, and packaging. |
| `@meith/cli` | Terminal client that discovers a running runtime and calls tools over the local socket. |

## Authority Model

The runtime is centered on `packages/desktop/src/main/bootstrap.ts`.
`bootstrap(userDataPath, options)` wires the services, registers tools, starts
the local socket server, writes config, publishes an instance record, hydrates
state, and returns the service container.

```
Renderer IPC ─────┐
CLI socket ───────┤
Plugin bridge ────┤
Agent MCP bridge ─┼── ToolRegistry ── services ── app state / files / browser / processes
Internal calls ───┘
```

`ToolRegistry.call()` is the common choke point. It:

- rejects unknown tools,
- validates arguments with each tool's Zod schema,
- asks `PermissionService` to authorize privileged calls,
- applies timeout and cancellation handling,
- passes an abort signal and optional event emitter to the tool,
- normalizes returned values into a `ToolResult`,
- logs and audits every call.

## Services

The main services are created in `bootstrap.ts`:

- `AppStateService` owns persisted app state and emits reactive state changes.
- `BrowserTabService` owns browser/workspace tab records and delegates live web
  contents to a `BrowserViewHost`.
- `SpaceService` creates, updates, switches, and closes workspaces.
- `ProjectService` detects folders, opens projects into spaces, generates
  templates, prewarms generated projects, and starts project run commands.
- `WorkspaceFileService` reads, writes, patches, searches, and diagnoses files
  inside trusted workspace boundaries.
- `DevServerService` starts and tracks managed dev-server processes and logs.
- `TerminalService` starts and tracks terminal sessions.
- `PluginHostService` installs plugins, stores requested and approved grants,
  resolves plugin tab identity, and gates plugin bridge APIs.
- `AgentService` stores sessions and messages, runs the configured adapter, and
  gates agent tool calls.
- `McpBridgeService` exposes per-agent-session tools over a localhost MCP-style
  HTTP endpoint for external ACP agents.
- `PermissionService` authorizes non-renderer privileged calls and writes audit
  entries.
- `StorageService` exposes read-only storage introspection tools.
- `ToolSocketService` exposes the registry over a local NDJSON socket.

## Persistence

Runtime data lives under the user data path passed to `bootstrap()`. In normal
use, discovery data lives under `~/.meith`:

- `~/.meith/config.json` records the active runtime socket, app version,
  protocol version, user data path, instance path, and managed CLI launcher.
- `~/.meith/instances/<pid>.json` records live runtime instances so the CLI can
  list, target, or kill them.
- `<userData>/state.json` stores spaces, projects, browser tabs, workspace tabs,
  file edit events, plugins, and app settings.
- `<userData>/logs.jsonl` stores app logs.
- `<userData>/audit.jsonl` stores tool authorization/audit records.
- `<userData>/artifacts/` stores screenshot and bug-report artifacts.
- `<userData>/plugins/` stores extracted packaged plugins.
- agent metadata, transcripts, and config are managed by `AgentStore` and
  `AgentConfigStore`.

`JsonStore` writes bounded JSON atomically and uses migrations before schema
validation. Corrupt state is backed up and reset to defaults instead of crashing
the app. `JsonlStore` stores append-only logs and audit records.

## Workspaces and Projects

A space is the visible workspace in the left rail. A project is a folder on disk.
Opening a folder with `project_open` detects package metadata, creates or reuses
a dedicated space, records a project, and opens an editor tab rooted at the
folder.

`ProjectService` detects:

- project name,
- package manager (`pnpm`, `npm`, `yarn`, `bun`, or `unknown`),
- framework hints such as Next.js, Vite, React, Vue, Svelte, Astro, Remix, Node,
  or `unknown`,
- package scripts.

Run commands live on the project record. The top bar's Run button calls
`project_run`, which uses the configured command or falls back to a detected
`dev`/`start`-style script. Dev servers are associated by cwd, their output is
captured, and detected ports can be opened in browser tabs.

Generated projects are copied from `templates/` into `~/Documents/meith` by
default. `project_prewarm` can keep generated app copies ready so creating a new
workspace is fast.

## Browser Runtime

Browser tab metadata is persisted in app state. Live browser views are supplied
by a `BrowserViewHost`:

- Electron uses `ElectronBrowserViewHost` backed by native `WebContentsView`s.
- Headless tests and harness runs use `HeadlessBrowserViewHost`.

The renderer measures the actual content area and reports it over
`meith:browser:viewport`; the main process sizes the native view to that region.
When settings, overlays, or split-drag drop zones need DOM interaction above the
native view, the renderer temporarily collapses the view.

Browser tools include tab listing, open/navigate/back/forward/refresh/focus/close,
screenshot capture, DOM state extraction, element clicks, typing, scrolling,
keyboard input, CDP commands, console logs, and network logs.

Automation callers (`agent` and `plugin`) must claim a tab with
`browser_use_start` before mutating it. Interactive callers (`renderer`, `cli`)
can control unclaimed tabs directly. Ownership conflicts return
`PERMISSION_DENIED`.

## Renderer

The renderer is a React and Vite workbench in
`packages/desktop/src/renderer/src`. It uses the preload bridge exposed as
`window.meith`; in browser-only preview mode it falls back to an in-memory mock
bridge.

Major surfaces:

- `SpacesRail` for switching, creating, opening, closing, and inspecting spaces.
- `TabStrip` and `PaneToolbar` for browser/workspace tab management.
- `BrowserArea` for the embedded browser tab controls and native view target.
- `EditorView` for Monaco-backed file editing through `workspace_*` tools.
- `TerminalView` for PTY sessions.
- `AgentView` for session list, transcript, composer, stop button, and
  permission cards.
- `SettingsView` for app preferences, per-project run commands, agent config,
  plugin management, and about info.
- `DebugPanel` for tool runner, state, logs, and output diagnostics.
- `StatusBar` for connection, tab counts, running process count, and active port.

The renderer does not mutate services directly. It calls tools or dedicated IPC
stream channels, then re-renders from pushed app state.

## CLI

The CLI resolves a target runtime from `--socket`, `--instance`, live instance
records, or `~/.meith/config.json`. It sends NDJSON frames to the runtime socket.

Common surfaces:

- `meith [path]` launches the app and optionally opens a project path.
- `meith new [name]` creates and opens a generated project.
- mapped commands such as `open`, `tabs`, `navigate`, `screenshot`, `processes`,
  `dev-servers`, and `start-dev` call specific tools.
- `meith call <toolName>` can invoke any registered tool.
- `meith tools` lists runtime tools.
- `meith devlogs` attaches to a managed dev server's log stream.
- `meith app <list|logs|health|bug-report|kill|screenshot>` inspects or controls
  runtime instances.
- `meith setup` prints or writes shell PATH setup for the managed launcher.

## Agents

`AgentService` is implemented. It manages durable sessions, transcripts,
configuration, permission prompts, and adapter execution.

The default adapter is `MockAdapter`, which keeps the UI usable without an
external agent. When configured for `acp`, `AcpAdapter` spawns an external ACP
subprocess, initializes it, creates an ACP session, and passes a localhost MCP
endpoint so the external agent can call meith tools.

Agent tool calls use `caller: "agent"` and the agent session id. Read-only tools
run directly. Privileged tools require an explicit permission decision unless
auto-accept is enabled. Approved one-use grants are written into
`PermissionService` before the registry call.

## Plugins

A plugin is a web app loaded in a controlled plugin browser tab. It does not
register code into the main process and does not receive Node access. Instead,
the plugin preload exposes `window.meithPlugin` only when the main process
recognizes the tab as an enabled plugin.

Plugin manifests declare requested capabilities and API namespaces. The user
approves a subset of those requests. Runtime enforcement uses only approved
grants.

Approved API namespaces:

- `tools` lists and calls registry tools, still gated by approved capabilities.
- `storage` reads browser and workspace tab lists.
- `cdp` sends Chrome DevTools Protocol commands.
- `ai` streams text through the app's agent runtime.

See [PLUGIN_API.md](./PLUGIN_API.md) for author-facing details.

## Development Modes

Desktop app:

```bash
pnpm dev
```

Renderer-only mock mode:

```bash
pnpm dev:renderer
```

Headless main-process runtime:

```bash
pnpm --filter @meith/desktop dev:headless
```

Full verification:

```bash
pnpm check
```
