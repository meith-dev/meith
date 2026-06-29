# meith

Meith is a desktop AI workbench for building web apps.

It puts the pieces of web app work in one desktop window: project folders, code files, terminals, run commands, dev-server logs, a built-in browser, plugins, and agent chats. A shared tool system connects them. The visual app, CLI, plugins, and agents all work against the same project state, so an agent can edit code, start your dev server, open the app in the browser, click through the UI, read console output, and show you the diff.

Codex and Claude Code can write code. Meith gives them a place to work: the browser, terminal, logs, files, diffs, and permissions all sit in the same workbench the agent can use.

Meith doesn't lock you into one AI provider. The agent runtime uses an adapter interface and connects to external agents via ACP (Agent Client Protocol), keeping the desktop app independent of any specific model vendor or SDK.

The name comes from the Irish *meitheal*: a group of people coming together to work on a common task. In meith, the app, command line, plugins, and agents gather around a single workspace.

## What you can do with it

* Open a web project folder in its own workspace.
* Browse and edit your app's code in the integrated editor.
* Start and stop your dev server from the top bar.
* Open the running app in the built-in browser.
* Let an agent open pages, click, type, inspect the UI, read console output, and take screenshots.
* Watch browser state and dev-server logs in the same window.
* Split panes to arrange your browser, editor, terminal, or agent side by side.
* Ask an agent to build features in the context of your current project: editing files, running the dev server, and checking the app in the browser.
* Review working-tree changes in the built-in Diff tab, with summary counts in the top bar and patches loaded only when you select a file.
* Install web-app plugins and explicitly approve the APIs they can use.
* Use the `meith` terminal command to inspect and control a running app instance.

## How the app is organized

Workspaces are the core of meith. One workspace generally maps to one project folder on your disk. Within each workspace, you can have:

* browser tabs for local testing, research, and agent-controlled checks,
* editor tabs for project files,
* terminal tabs,
* agent chat tabs,
* run commands and environment configurations,
* plugin tabs.

Meith keeps your spaces, tabs, projects, settings, logs, and agent sessions across restarts. Agent transcripts are stored as compact per-session JSONL records, so long chats can stream and resume without swelling the app-state index.

## Agent and plugin safety

Agents and plugins do not get unrestricted access by default.

Every major action routes through a shared tool registry in the desktop main process. Each tool declares what it can do, such as reading state, writing files, controlling the browser, starting processes, making network requests, or performing destructive actions.

The renderer is part of the core app. Agents and plugins have tighter limits:

* read-only actions execute without interruption,
* file writes, browser control, process starts, and destructive actions require explicit permission or an approved grant,
* the host resolves plugin identity directly from the plugin tab itself, ignoring data the plugin sends,
* plugin tabs only access the `window.meithPlugin` APIs you specifically approve.

Additional enforcement layers harden the runtime against privilege escalation:

* **Electron web content hardening** — every browser tab created by meith registers a `setPermissionRequestHandler` that denies all OS-level permission requests (camera, microphone, geolocation, notifications, MIDI, HID, serial, Bluetooth, clipboard-read, fullscreen), and a `setWindowOpenHandler` that denies all `window.open()` and `target=_blank` navigations that would spawn a new renderer process. Plugins and web-content tabs cannot silently acquire hardware access or open unchecked popups.
* **Plugin archive limits** — packaged plugin archives are rejected before extraction if they exceed 50 MB total, contain more than 2 000 files, or include any single entry larger than 10 MB. Path traversal, hard links, and symbolic links are also rejected.
* **Workspace symlink filtering** — the file listing and file search walks skip symbolic link entries. A symlink inside a workspace that points outside the project boundary cannot be used to read or expose files that the caller would not otherwise reach.
* **Capability-gated tool registry** — every mutating tool must declare at least one privileged capability (`writes-files`, `controls-browser`, `starts-process`, or `destructive`). A test sentinel enforces this rule at build time so new tools cannot bypass the permission gate by omission.

For agents, meith includes a built-in mock adapter for local testing and an ACP subprocess adapter for external agents. ACP lets an agent use meith's tools without tying the desktop app to one AI provider. Meith only accepts ACP provider-side approvals for tools exposed by its MCP server. Provider-native and unknown tool approvals are denied at the boundary.

## Documentation

Documentation lives in the repository markdown under `docs/`. The public Next.js
site reads those files and their frontmatter at build time, so repo docs and web
docs stay in sync.

User-facing docs live in `docs/user/`:

* [Introduction](./docs/user/INTRODUCTION.md)
* [Getting started](./docs/user/GETTING_STARTED.md)
* [Using meith](./docs/user/USING_MEITH.md)
* [Workspaces & tabs](./docs/user/SPACES.md)
* [Working with agents](./docs/user/WORKING_WITH_AGENTS.md)
* [Tools & permissions](./docs/user/TOOLS.md)
* [Plugins](./docs/user/PLUGINS.md)
* [The meith CLI](./docs/user/CLI.md)

Developer docs live in `docs/developer/`:

* [Developer overview](./docs/developer/DEVELOPERS.md)
* [Architecture](./docs/developer/ARCHITECTURE.md) covers the packages, boot path, services, persistence, renderer, CLI, agents, and plugins.
* [Tool protocol](./docs/developer/TOOL_PROTOCOL.md) details the local socket protocol, tool result envelopes, capabilities, timeouts, cancellation, and caller policies.
* [Adding tools](./docs/developer/ADDING_TOOLS.md) walks through adding a new tool to the shared registry.
* [Agent runtime](./docs/developer/AGENT_RUNTIME.md) breaks down sessions, adapters, permissions, MCP bridging, and ACP subprocess integration.
* [Plugin API](./docs/developer/PLUGIN_API.md) covers plugin manifests, installation, approved grants, `window.meithPlugin`, and the security model.

## Developer information

This repository is a pnpm monorepo containing the desktop runtime packages plus the public web app:

| Package | Purpose |
| --- | --- |
| `@meith/shared` | Shared Zod schemas, domain types, IDs, settings, app state, and `ToolResult` helpers. |
| `@meith/protocol` | Tool definitions, tool descriptors, NDJSON wire messages, naming helpers, and plugin API types. |
| `@meith/desktop` | Electron main process, preload bridges, React renderer, services, tools, socket server, plugins, provider-agnostic agent adapters, and packaging. |
| `@meith/cli` | The `meith` terminal command that talks to the running runtime socket. |
| `@meith/web` | Next.js documentation and marketing site under `apps/web`. |

Requirements:

* Node.js 20 or newer
* pnpm 9 or newer

Common commands:

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm check
```

Run the desktop app in development:

```bash
pnpm dev
```

Run the renderer only, with an in-memory mock bridge:

```bash
pnpm dev:renderer
```

Run the main-process services without Electron:

```bash
pnpm --filter @meith/desktop dev:headless
```

Use the CLI through the monorepo:

```bash
pnpm cli tools
pnpm cli app list
pnpm cli open http://localhost:3000
pnpm cli tabs
pnpm cli projects
pnpm cli files /path/to/project --recursive true
pnpm cli diff /path/to/project --includePatches false
pnpm cli call app_health
```

The CLI covers the registered desktop tool catalog: browser tabs
and automation, spaces/workspace tabs, projects/templates, workspace files,
git diff, terminals/dev servers, settings, storage, plugins, and runtime
diagnostics. `pnpm cli call <toolName>` is the fallback for scripts and tools
without a named CLI command yet.

Package the desktop app:

```bash
pnpm pack:desktop
pnpm dist:mac
```

The packaged desktop build stages its own Node/npm/npx runtime and `meith` CLI before `electron-builder` runs. Packaged app processes prefer Meith-owned Node tooling from the app bundle, not from the user's machine. Built-in ACP presets launch through the bundled `npx`, which may fetch ACP packages from the npm registry into Meith's managed npm cache. Project templates are copied without any builder-machine `node_modules`.

Packaging verifies the final runtime bundle before signing: Node/npm/npx, CLI dependencies, templates, and the native `node-pty` helper. Local macOS builds use ad hoc signing, so the generated `.app`, ZIP, and DMG are internally valid and runnable. They are not Developer ID signed or notarized.

## Release process

Release Please and Conventional Commits drive releases. Do not push release
commits or version bumps directly to `main`.

1. Land normal work through pull requests with Conventional Commit titles and
   commits, such as `feat(renderer): add split previews` or
   `fix(cli): handle stale sockets`.
2. The release workflow keeps a Release Please PR open against `main`.
3. Review and merge the Release Please PR when ready to publish. That PR updates
   package versions, the desktop macOS bundle version, `CHANGELOG.md`, and the
   release manifest.
4. After the Release Please PR merges, CI creates the GitHub Release, builds the
   macOS arm64 desktop artifacts, writes checksums, and uploads them to the
   release.

See [Release process](docs/developer/RELEASES.md) for maintainer details,
required repository settings, and local dry-run commands.

The current macOS release build uses ad hoc signing and is not Developer ID signed or notarized, so macOS may warn on first open.

At startup, the runtime writes `~/.meith/config.json`, registers the running instance under `~/.meith/instances/`, and exposes a managed launcher at `~/.meith/bin/meith`. Open the desktop app once, then run `~/.meith/bin/meith setup` for shell instructions, or `~/.meith/bin/meith setup --write` to add that launcher directory to your shell config. After restarting your shell, use `meith` directly.
