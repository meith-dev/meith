# meith

Meith is a desktop workbench for building web apps with AI.

It collects the pieces web developers usually scatter across multiple windows and puts them in one place: project folders, code files, terminal sessions, a live localhost preview, run commands, dev-server logs, plugins, and agent chat sessions. A shared tool system connects everything. The visual interface, the terminal command, a plugin, and an AI agent all interact with the exact same project state, rather than maintaining their own isolated views — so an agent can edit a component, start your dev server, and check the result in the preview without ever leaving the window.

Meith doesn't lock you into one AI provider. The agent runtime uses an adapter interface and connects to external agents via ACP (Agent Client Protocol), keeping the desktop app independent of any specific model vendor or SDK.

The name comes from the Irish *meitheal*: a group of people coming together to work on a common task. In meith, the app, command line, plugins, and agents gather around a single workspace.

## What you can do with it

* Open a web project folder in its own workspace.
* Browse and edit your app's code in the integrated editor.
* Start and stop your dev server from the top bar.
* Preview the running app on localhost in an embedded browser tab.
* Watch the preview update and read dev-server logs without leaving the window.
* Split panes to arrange your preview, editor, terminal, or agent side by side.
* Ask an agent to build features in the context of your current project — editing files, running the dev server, and checking the live preview.
* Review working-tree changes in the built-in Diff tab, with cached summary counts in the top bar and patches loaded only when you select a file.
* Install web-app plugins and explicitly approve the APIs they can use.
* Use the `meith` terminal command to inspect and control a running app instance.

## How the app is organized

Workspaces are the core of meith. One workspace generally maps to one project folder on your disk. Within each workspace, you can have:

* browser tabs for local testing or research,
* editor tabs for project files,
* terminal tabs,
* agent chat tabs,
* run commands and environment configurations,
* plugin tabs.

The app persists your spaces, tabs, projects, settings, logs, and agent sessions across restarts. Agent transcripts are stored as compact per-session JSONL records so long chats can stream and resume without bloating the app-state index.

## Agent and plugin safety

Agents and plugins do not get unrestricted access by default.

Every major action routes through a shared tool registry in the desktop main process. Tools declare their capabilities upfront, like reading state, writing files, controlling the browser, starting processes, making network requests, or performing destructive actions.

The renderer is fully trusted as part of the core app, but agents and plugins face strict limits:

* read-only actions execute without interruption,
* file writes, browser control, process starts, and destructive actions require explicit permission or an approved grant,
* the host resolves plugin identity directly from the plugin tab itself, ignoring data the plugin sends,
* plugin tabs only access the `window.meithPlugin` APIs you specifically approve.

For agents, meith currently includes a built-in mock adapter for local testing and an ACP subprocess adapter for actual external agents. The ACP path allows an agent to use meith's tools without forcing the app to depend on a particular AI provider. ACP provider-side permission requests are only approved automatically when they refer to tools exposed by meith's MCP server; all provider-native or unknown tool approvals are denied before they can bypass the registry.

## Documentation

The repository markdown under `docs/` is the source of truth for documentation.
The public Next.js site reads those files and their frontmatter at build time, so
repo docs and web docs cannot drift into separate copies.

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

Friendly CLI commands cover the registered desktop tool catalog: browser tabs
and automation, spaces/workspace tabs, projects/templates, workspace files,
git diff, terminals/dev servers, settings, storage, plugins, and runtime
diagnostics. `pnpm cli call <toolName>` remains the exact-name escape hatch for
scripts and newly-added tools.

Package the desktop app:

```bash
pnpm pack:desktop
pnpm dist:mac

```

The packaged desktop build stages its own Node/npm/npx runtime and a self-contained `meith` CLI runtime before `electron-builder` runs. Packaged app processes resolve Meith-owned Node tooling from the app bundle first, not from the user's machine. Built-in ACP presets launch through the bundled `npx`, which may fetch ACP packages from the npm registry into Meith's managed npm cache. Project templates are copied without any builder-machine `node_modules`.

Packaging also verifies the final runtime bundle: Node/npm/npx, CLI dependencies, templates, and the native `node-pty` helper are checked before the app is signed. Local macOS builds are ad-hoc signed so the generated `.app`, ZIP, and DMG are internally valid and runnable. This is not Developer ID signing or notarization.

## Release process

Releases are driven by Release Please and Conventional Commits. Do not push
release commits or version bumps directly to `main`.

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

The current macOS release build is ad-hoc signed but not Developer ID signed or notarized, so macOS may warn on first open.

On startup, the runtime writes `~/.meith/config.json`, registers the running instance under `~/.meith/instances/`, and exposes a managed launcher at `~/.meith/bin/meith`. Open the desktop app once, then run `~/.meith/bin/meith setup` for shell instructions, or `~/.meith/bin/meith setup --write` to add that launcher directory to your shell config. After restarting your shell, use `meith` directly.
