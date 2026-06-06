# meith TODO

This document is the implementation roadmap for turning the current scaffold into a real desktop AI development environment. It is intentionally self-contained: assume the reader only has this repository and no prior context.

## Current Architecture Snapshot

The repository is a pnpm monorepo with four packages:

- `packages/shared`: shared Zod schemas, domain types, IDs, app config, and app state types.
- `packages/protocol`: tool contracts, tool descriptors, newline-delimited JSON socket messages, and naming helpers.
- `packages/desktop`: Electron main/preload/renderer app, service container, app state service, local tool socket, tool registry, placeholder browser/project/terminal/agent services, and a React debug UI.
- `packages/cli`: terminal command that connects to the running desktop/headless runtime socket and calls registered tools.

The strongest foundation already present is the shared tool registry pattern:

- Tools are registered in `packages/desktop/src/main/bootstrap.ts`.
- Tools are defined under `packages/desktop/src/main/tools`.
- The CLI reaches tools through `ToolSocketService`.
- The renderer reaches tools through Electron IPC.
- The same tool contract can later be exposed to agents, plugins, and MCP.

The current scaffold is useful, but most runtime capabilities are placeholders. The next work should preserve the central design principle:

> The desktop main process is the authority. Renderer UI, CLI, plugins, and future agents must all call the same validated tool registry instead of reaching into services directly.

## Phase 0: Baseline Health And Repository Hygiene

- [ ] Run and record the current baseline:
  - `pnpm install`
  - `pnpm build`
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm --filter @meith/desktop dev:headless`
  - in another terminal: `pnpm cli tools`, `pnpm cli open http://localhost:3000`, `pnpm cli tabs`, `pnpm cli state`
- [ ] Fix any current build/type/test failures before adding new architecture.
- [ ] Add a root `check` script that runs build, typecheck, tests, and lint once linting exists.
- [ ] Add ESLint or Biome for formatting/linting across all packages.
- [ ] Add `.editorconfig` and document Node/pnpm versions in the README.
- [ ] Add `docs/ARCHITECTURE.md`, `docs/TOOL_PROTOCOL.md`, `docs/ADDING_TOOLS.md`, `docs/AGENT_RUNTIME.md`, and `docs/PLUGIN_API.md`.
- [ ] Decide whether generated output directories such as `packages/desktop/out` and TypeScript build info files should be committed. If not, add them to `.gitignore` and remove committed generated artifacts.
- [ ] Add CI with at least:
  - install
  - typecheck
  - test
  - build
  - CLI/headless smoke test

Acceptance criteria:

- A fresh clone can run the documented commands successfully.
- CI proves the headless service path and CLI socket path work.
- Documentation explains the intended service boundaries before more features are added.

## Phase 1: Strengthen The Shared Protocol

The socket protocol is currently simple and workable. It needs to become durable enough for long-running tools, multiple clients, and agent/plugin callers.

- [ ] Add a protocol version to every socket request/response.
- [ ] Add `clientInfo` to socket calls:
  - caller type: `cli`, `renderer`, `agent`, `plugin`, `internal`
  - cwd
  - optional session ID
  - optional space ID
  - optional tab ID
- [ ] Add a standard response envelope for tool results:
  - `ok`
  - `content`
  - `meta`
  - `diagnostics`
  - `error`
- [ ] Decide whether tools should return raw values or a structured `ToolResult` type. Prefer a structured type for agent compatibility.
- [ ] Add support for streaming tool events:
  - progress
  - logs
  - partial text
  - binary/image artifacts
  - cancellation
- [ ] Add `cancel_tool_call` request message.
- [ ] Add request timeout configuration per tool.
- [ ] Add explicit error codes:
  - `UNKNOWN_TOOL`
  - `VALIDATION_ERROR`
  - `PERMISSION_DENIED`
  - `TIMEOUT`
  - `TOOL_FAILED`
  - `RUNTIME_SHUTTING_DOWN`
- [ ] Add tests for malformed frames, partial frames, concurrent requests, request cancellation, and server shutdown.
- [ ] Add a `ToolCapability` or `ToolSafety` metadata field:
  - read-only
  - writes-files
  - controls-browser
  - starts-process
  - accesses-network
  - destructive

Acceptance criteria:

- The CLI can run concurrent tool calls without cross-talk.
- Invalid requests produce stable, typed errors.
- A future agent runtime can inspect tool metadata and make safe permission decisions.

## Phase 2: Storage, State, And Migrations

`AppStateService` currently stores the whole app state as one JSON file. That is acceptable for a scaffold, but it will not scale to chats, logs, screenshots, large histories, browser events, or process streams.

- [x] Add a state migration system:
  - `version: 1` (`CURRENT_STATE_VERSION` in `storage/migrations.ts`)
  - migration functions from old versions to new versions (legacy v0 -> v1)
  - tests for loading older state shapes (`storage.test.ts`)
- [x] Split durable storage into categories:
  - small app preferences/state (`state.json` via `JsonStore`)
  - tab/workspace/project collections (in app state)
  - append-only logs (`logs.jsonl` via `JsonlStore`)
  - agent messages/sessions (deferred to the agent runtime phase)
  - artifacts such as screenshots (deferred to the browser runtime phase)
- [x] Decide storage backend:
  - keep JSON for small state
  - use JSONL for append-only collections
  - SQLite considered but deferred (no native dep yet; JSON/JSONL meets needs)
- [x] Make writes atomic:
  - write to temp file
  - fsync the temp file before rename
  - rename into place (`atomicWriteFileSync`)
- [x] Add debounced persistence for high-frequency state changes (`JsonStore` debounce).
- [x] Add storage compaction for append-only logs (`JsonlStore.compact`).
- [x] Add a storage inspection/debug tool:
  - `storage_list_collections`
  - `storage_read_collection`
  - `storage_export_state`
- [~] Add a setting for data directory location (current dir reported by storage tools / `MEITH_USER_DATA`; runtime relocation deferred).
- [x] Add corruption handling:
  - backup invalid state (`.corrupt-<ts>` sibling)
  - reset to defaults
  - surface warning in logs

Acceptance criteria:

- State survives app restart.
- Loading old state is tested.
- High-volume logs/messages do not rewrite one giant state file on every update.

## Phase 3: Real Browser Runtime

`BrowserTabService` now coordinates real browser views through an injected `BrowserViewHost` abstraction, so the runtime stays Electron-free for tests/CLI while the desktop app drives real `WebContentsView` instances.

- [x] Extend `BrowserTabService` to manage live views by tab id via a `BrowserViewHost` interface (`ElectronBrowserViewHost` for the app, `HeadlessBrowserViewHost` for tests/CLI).
- [x] Keep tab records in state, but keep live `WebContentsView` instances in memory (in the host).
- [x] Implement real tab lifecycle:
  - create tab / load URL / focus / close / reload / back / forward
  - update title/favicon/url (host `onNavStateChanged` -> persisted record)
  - persist last known URL/title/loadState (state v2)
- [x] Add layout management (`ElectronBrowserViewHost`):
  - app chrome region (`CHROME_TOP`) + browser content region
  - resize views when window resizes (`mainWindow.on("resize")`)
  - hide inactive views (single visible view per host)
- [x] Add preload scripts for normal browser tabs (`preload/webContent.ts`):
  - safe `contextBridge` message bridge
  - no Node integration for normal web content
- [x] Add a real `take_screenshot` implementation using `webContents.capturePage()`.
- [x] Add browser tools: `navigate`, `go_back`, `go_forward`, `refresh`, `close_browser_tab`, `focus_browser_tab`, `get_active_tab`.
- [x] Add tab ownership/claiming for automation:
  - `browser_use_start` / `browser_use_end`
  - prevent two agents/tools from controlling the same tab concurrently (`TabOwnershipError` -> `PERMISSION_DENIED`)
  - release control on session end (`releaseOwner`)
- [x] Add screenshot artifact storage under the user data directory (`ArtifactStore`).
- [x] Update renderer UI to show real tab state and active tab (load-state + ownership badges).

Acceptance criteria:

- [x] `meith open http://localhost:3000` creates a real browser view in the desktop app.
- [x] `meith screenshot <tabId>` captures an actual image file / structured image result.
- [x] Closing/focusing/navigating tabs works from renderer and CLI through the same tools.

## Phase 4: Browser Automation And Diagnostics Tools

After real browser views exist, add the automation and diagnostic layer needed by agents and CLI.

- [ ] Add a CDP service around Electron `webContents.debugger`.
- [ ] Track CDP targets by tab ID.
- [ ] Implement `cdp_command` with:
  - target tab ID
  - timeout
  - captured console output
  - structured result formatting
  - safe error reporting
- [ ] Implement DOM extraction:
  - `get_browser_state`
  - assign stable element IDs
  - include roles, labels, text, bounds, disabled/hidden state
  - include current URL/title/viewport
- [ ] Implement interaction tools:
  - `click_element`
  - `type_text`
  - `scroll_page`
  - `send_keys`
- [ ] Add app-target variants where appropriate:
  - inspect main app renderer
  - screenshot app chrome
  - get renderer console logs
- [ ] Capture browser console logs per tab.
- [ ] Capture network logs per tab:
  - method
  - URL
  - status
  - request/response timing
  - failure reason
- [ ] Add tests with Playwright or Electron integration tests for:
  - opening a local HTML page
  - extracting browser state
  - clicking a button
  - typing into an input
  - reading console/network logs
  - capturing screenshot

Acceptance criteria:

- CLI can inspect and interact with a browser tab without direct renderer access.
- Automation tools fail with clear messages when a tab is not claimed or no longer exists.
- Console/network diagnostics are available to both CLI and future agents.

## Phase 5: Real Desktop Shell UI

The renderer is currently a debug control panel. Keep that panel, but add a production shell for daily use.

- [ ] Introduce a layout with:
  - left sidebar for spaces/projects
  - top or side browser tab strip
  - workspace/editor tab strip
  - central browser/workspace area
  - bottom/status area
  - collapsible logs/tool panel
- [ ] Add space management:
  - create space
  - rename space
  - switch active space
  - color/icon per space
  - close/archive space
- [ ] Add browser tab management UI:
  - open URL
  - close tab
  - focus tab
  - show active tab
  - show associated project cwd
- [ ] Add workspace tab UI:
  - open project
  - open terminal
  - open agent chat placeholder
  - open preview
- [ ] Move the current Tools/State/Logs panels into a developer/debug area.
- [ ] Add loading, empty, error, and disconnected states.
- [ ] Add keyboard shortcuts:
  - new tab
  - close tab
  - switch tabs
  - command palette placeholder
- [ ] Keep text dense and utility-focused. Avoid marketing-style landing page UI.
- [ ] Add visual regression or smoke screenshots for main layouts.

Acceptance criteria:

- The first screen is a usable workbench, not only a debug panel.
- State changes from CLI and renderer remain synchronized.
- The debug tool runner is still available for development.

## Phase 6: Terminal And Dev Server Runtime

`TerminalService` and `DevServerService` are stubs. Implement real process management next.

- [ ] Add `node-pty` or an equivalent PTY package for terminals.
- [ ] Implement terminal lifecycle:
  - create terminal
  - write input
  - resize
  - kill
  - reconnect snapshot/buffer
  - stream data to renderer
- [ ] Inject runtime environment into terminals:
  - prepend the app CLI bin path when packaged
  - set a socket env var for dev log attachment
  - set app-specific environment variables for plugins/tools
- [ ] Implement dev server process spawning:
  - command
  - cwd
  - env
  - detached process group
  - stdout/stderr capture
  - exit status
  - kill tree
- [ ] Add process tree detection:
  - include child processes
  - include listening ports
  - associate processes with cwd/project
- [ ] Implement `get_process_tree` for real processes.
- [ ] Implement `get_process_logs` for dev servers and terminals.
- [ ] Add log streaming protocol for CLI:
  - attach by cwd
  - replay existing logs
  - stream new logs
  - forward stdin/signals
- [ ] Add CLI command:
  - `meith devlogs`
  - `meith devlogs --cwd <path>`
- [ ] Add renderer terminal component, likely using xterm.js.
- [ ] Add process cleanup on app quit.

Acceptance criteria:

- A dev server can be started by the app and inspected from CLI.
- Logs are available in renderer, CLI, and tool calls.
- Processes are cleaned up reliably on quit or project close.

## Phase 7: Project Management And Templates

`ProjectService` currently only records paths. Build project discovery and generated project support.

- [ ] Expand project schema:
  - id
  - name
  - cwd
  - framework
  - package manager
  - scripts
  - last opened
  - associated browser tabs
  - associated workspace tabs
- [ ] Implement project open flow:
  - validate cwd
  - detect package manager
  - detect scripts from package.json
  - detect common frameworks
  - create workspace tab
  - optionally start dev server
- [ ] Add tools:
  - `project_open`
  - `project_list`
  - `project_detect`
  - `project_start_dev_server`
  - `project_stop_dev_server`
- [ ] Add templates:
  - `templates/app-basic`
  - `templates/plugin-basic`
  - ensure templates are valid package workspaces or standalone apps
- [ ] Add generated project root under the configured user data or workspace directory.
- [ ] Add project buffer/prewarm service:
  - maintain N ready app projects
  - allocate one on demand
  - start dev server
  - open preview tab
- [ ] Add plugin project creation flow separately from normal app projects.
- [ ] Add README files inside each template explaining expected scripts and contracts.

Acceptance criteria:

- A user can open an existing project and start its dev server.
- A user can create a new generated app project from a template.
- Project metadata is available to tools, renderer, CLI, and future agents.

## Phase 8: Code Editor / IDE Integration

Choose an editor strategy before implementing agent editing workflows.

- [ ] Decide between:
  - embedded code-server
  - Monaco editor for simpler local editing
  - launching external VS Code with an extension bridge
  - hybrid approach
- [ ] Define editor service contract:
  - open workspace
  - open file
  - read file
  - write file
  - apply diff
  - get diagnostics
  - focus symbol/range
  - save all
- [ ] Add workspace tab kind for editor sessions.
- [ ] Implement `get_diagnostics` against the chosen editor/language-server path.
- [ ] Implement file tools:
  - `workspace_read_file`
  - `workspace_write_file`
  - `workspace_apply_patch`
  - `workspace_list_files`
  - `workspace_search`
- [ ] Add guardrails for file writes:
  - require cwd/workspace
  - prevent writing outside workspace unless explicitly allowed
  - log all writes
  - expose undo metadata
- [ ] Add inline diff UI for agent edits.
- [ ] Add tests for read/write/apply patch behavior.

Acceptance criteria:

- The app can open a project workspace and surface diagnostics.
- Tools can read and write files through a controlled main-process service.
- Future agents can edit code without direct filesystem access.

## Phase 9: Agent Runtime

`AgentService` currently exposes the adapter seam but no real adapter. Implement the runtime in layers.

- [ ] Finalize agent data model:
  - agent definitions
  - sessions
  - messages
  - tool calls
  - tool results
  - usage
  - status
  - errors
  - permissions
- [ ] Persist agent sessions and messages outside the small app state file.
- [ ] Add renderer chat UI:
  - session list
  - message transcript
  - streaming response
  - tool call cards
  - errors/retry
  - stop/cancel
- [ ] Add agent adapter interface support for:
  - streaming text
  - tool calls
  - cancellation
  - session resume
  - model selection
  - cwd/space context
- [ ] Implement a first provider adapter:
  - either a direct SDK adapter
  - or an ACP-style subprocess adapter
  - keep provider-specific code isolated from core services
- [ ] Build an MCP bridge over the existing tool registry:
  - expose registered tools
  - validate inputs
  - call `registry.call`
  - stream results where supported
- [ ] Add permission model:
  - read-only tools allowed by default
  - browser control requires tab claim
  - file writes require explicit mode/permission
  - process start/kill may require approval
- [ ] Add system prompt generation:
  - include current workspace
  - include active browser tabs
  - include available tools
  - include safety/permission rules
- [ ] Add chat-to-space association.
- [ ] Add session cleanup and idle process GC.

Acceptance criteria:

- A user can start an agent session in a workspace.
- The agent can list tools and call them through the same registry as CLI/renderer.
- Tool calls are visible, auditable, cancelable, and persisted.

## Phase 10: CLI Maturity

The CLI already has a working socket client and command mapping. Extend it into a daily-use interface.

- [ ] Add `meith --version` and ensure it works without connecting to the runtime.
- [ ] Add `meith --help` that shows built-in commands even if the app is not running.
- [ ] Add command-specific help:
  - `meith open --help`
  - `meith call <tool> --help`
  - generated from tool descriptors when runtime is available
- [ ] Add app launch commands:
  - `meith`
  - `meith .`
  - `meith /path/to/project`
  - `meith new`
- [ ] Add runtime discovery:
  - support multiple running instances
  - list instances
  - choose instance
  - fallback to config socket
- [ ] Add `meith app` namespace:
  - `meith app list`
  - `meith app kill`
  - `meith app logs`
  - `meith app screenshot`
- [ ] Add output modes:
  - human readable
  - JSON
  - quiet
  - artifact path only for screenshots
- [ ] Add better flag parsing:
  - support nested JSON values
  - support `--arg-json`
  - support repeated flags
  - support stdin payloads
- [ ] Package/install the CLI during desktop startup or installer flow.
- [ ] Add shell PATH setup guidance, but avoid silently modifying shell rc files unless user opts in.

Acceptance criteria:

- CLI is useful both inside and outside integrated terminals.
- CLI commands are generated from the same tool descriptions where possible.
- CLI can select and talk to the intended runtime instance.

## Phase 11: Plugin System

Plugins should be web apps running in controlled browser tabs with a privileged preload API.

- [ ] Define plugin manifest:
  - id
  - name
  - version
  - entry URL
  - permissions
  - requested APIs
- [ ] Add plugin tab mode to browser tab schema.
- [ ] Create plugin preload exposing a narrow API:
  - `plugin.tools.call(name, input)`
  - `plugin.tools.list()`
  - `plugin.storage.getBrowserTabs()`
  - `plugin.storage.getWorkspaceTabs()`
  - `plugin.cdp.*` only if permissioned
  - `plugin.ai.streamText()` only after agent/model runtime exists
- [ ] Ensure plugin tabs do not accidentally target themselves in browser automation lists unless explicitly requested.
- [ ] Add permission checks for plugin tool calls.
- [ ] Add plugin dev template under `templates/plugin-basic`.
- [ ] Add plugin installation/loading flow:
  - local directory
  - dev server URL
  - packaged plugin
- [ ] Add plugin management UI.
- [ ] Add tests proving normal browser tabs do not receive plugin APIs.

Acceptance criteria:

- A plugin dev app can run in a plugin tab and call safe app APIs.
- Plugin permissions are explicit and enforced in the main process.
- Plugins cannot bypass the central tool registry.

## Phase 12: Security And Permissions

Before real agents can write files, drive browsers, or start processes, permissions need to be explicit.

- [ ] Add a centralized permission service.
- [ ] Classify every tool with capability metadata.
- [ ] Enforce permission checks inside `ToolRegistry.call` or a wrapper around it.
- [ ] Add per-caller policies:
  - renderer
  - CLI
  - agent
  - plugin
  - internal
- [ ] Add per-session grants:
  - browser tab claim
  - workspace write permission
  - process start permission
  - network/tool access
- [ ] Add audit log:
  - who called tool
  - args summary
  - result summary
  - timestamp
  - cwd/session/space
- [ ] Redact secrets in logs and tool arguments.
- [ ] Harden Electron security:
  - no Node integration in untrusted web tabs
  - context isolation on
  - sandbox untrusted views
  - strict preload API
  - validate all IPC inputs
- [ ] Add tests for denied tool calls.

Acceptance criteria:

- A caller cannot perform privileged actions just because it can reach the socket.
- Dangerous actions are auditable and permissioned.
- Electron web content remains isolated from the host environment.

## Phase 13: Packaging, Distribution, And Runtime Installation

- [ ] Add packaging config for macOS first, then Windows/Linux if needed.
- [ ] Ensure the desktop app writes runtime config on startup:
  - user data path
  - socket path
  - version
  - instance metadata
- [ ] Add running instance registration:
  - PID
  - socket path
  - started at
  - app version
  - user data path
- [ ] Add cleanup of stale instance files and stale sockets.
- [ ] Install or expose CLI binary in a predictable location.
- [ ] Add update path for CLI when desktop app updates.
- [ ] Add icons, app name, bundle ID, and signing/notarization config.
- [ ] Add crash recovery:
  - stale socket cleanup
  - unsaved state flush
  - orphan process cleanup

Acceptance criteria:

- Packaged app starts, writes config, starts socket, and accepts CLI calls.
- CLI and desktop versions remain compatible or fail with a clear version error.

## Phase 14: Observability And Debugging

- [ ] Expand `Logger` into a structured logging pipeline:
  - source
  - level
  - timestamp
  - correlation/request ID
  - caller
  - session
  - tool name
- [ ] Persist logs separately from in-memory ring buffer.
- [ ] Add renderer log viewer filters.
- [ ] Add app diagnostic tools:
  - `app_get_logs`
  - `app_get_state`
  - `app_screenshot`
  - `app_list_instances`
  - `app_health`
- [ ] Add health status for:
  - socket server
  - browser view service
  - dev server service
  - terminal service
  - agent runtime
  - storage
- [ ] Add debug mode that enables app-target tools.
- [ ] Add a reproducible bug report export:
  - app state summary
  - logs
  - tool registry
  - environment info

Acceptance criteria:

- Failures in browser/process/agent paths can be diagnosed from inside the app and via CLI.
- Tool calls can be traced end to end.

## Phase 15: Testing Strategy

- [ ] Keep current headless socket integration tests and expand them.
- [ ] Add unit tests for every tool factory.
- [ ] Add storage migration tests.
- [ ] Add CLI parser tests for:
  - booleans
  - numbers
  - JSON payloads
  - repeated flags
  - unknown commands
  - runtime unavailable
- [ ] Add Electron integration tests:
  - boot app
  - open browser tab
  - call CLI command
  - renderer receives state update
  - screenshot works
- [ ] Add process tests:
  - spawn a tiny local HTTP server
  - detect port
  - capture logs
  - kill process tree
- [ ] Add agent adapter contract tests with a fake adapter.
- [ ] Add plugin isolation tests.
- [ ] Add visual smoke tests for renderer layouts.

Acceptance criteria:

- Every major service boundary has a direct test.
- A failing browser, process, socket, or storage behavior is caught before manual testing.

## Recommended Near-Term Order

If only one agent is continuing from here, do the work in this order:

1. Confirm baseline build/test/typecheck and fix any failures.
2. Write `docs/ARCHITECTURE.md` and `docs/TOOL_PROTOCOL.md` from the current code.
3. Strengthen protocol/result/error types before adding more tools.
4. Implement real browser `WebContentsView` tabs.
5. Implement screenshots and browser navigation tools.
6. Implement CDP diagnostics and DOM interaction tools.
7. Implement terminal/dev-server process runtime.
8. Implement project open/start flow.
9. Add agent runtime only after tools, browser, files, and process services are stable.
10. Add plugin system after browser tabs and permissions are mature.

## Files To Start With

- `packages/desktop/src/main/bootstrap.ts`: service composition and tool registration.
- `packages/desktop/src/main/services/ToolSocketService.ts`: local socket server.
- `packages/desktop/src/main/tools/registry.ts`: tool registration and validation.
- `packages/desktop/src/main/tools/browserTools.ts`: browser-facing tool definitions.
- `packages/desktop/src/main/tools/appTools.ts`: app/process/log tool definitions.
- `packages/desktop/src/main/services/BrowserTabService.ts`: tab data model and future browser view lifecycle.
- `packages/desktop/src/main/services/DevServerService.ts`: process runtime stub.
- `packages/desktop/src/main/services/TerminalService.ts`: PTY runtime stub.
- `packages/desktop/src/main/services/AgentService.ts`: agent adapter seam.
- `packages/cli/src/client.ts`: socket client.
- `packages/cli/src/index.ts`: CLI command dispatch.
- `packages/protocol/src/messages.ts`: wire protocol.
- `packages/protocol/src/tools.ts`: tool contract.
- `packages/shared/src/schemas.ts`: persistent state schema.

## Non-Goals For The Next Few Iterations

- Do not wire multiple AI providers before the app has real browser/process/file tools.
- Do not let the renderer, CLI, plugins, or agents bypass the tool registry.
- Do not build plugin power APIs before permissions exist.
- Do not store large chat/process/browser logs in the small app state JSON file.
- Do not implement browser automation directly in the renderer.
- Do not add broad filesystem write tools without workspace scoping and audit logs.

## Definition Of "Ready For Agent Integration"

The codebase is ready for a serious agent adapter when all of these are true:

- The app has real browser tabs backed by Electron views.
- CLI and renderer can call the same browser tools.
- Screenshots, browser state, console logs, and network logs work.
- Projects can be opened and associated with tabs/workspaces.
- Dev servers can be started, inspected, logged, and stopped.
- File read/write/apply-patch tools are scoped to a workspace and audited.
- Tool results and errors have stable structured envelopes.
- Permissions distinguish read-only, browser-control, process, and file-write capabilities.
- Agent messages and tool calls are persisted outside the small app state file.

