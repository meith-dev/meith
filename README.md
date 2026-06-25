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

The app persists your spaces, tabs, projects, settings, logs, and agent sessions across restarts.

## Agent and plugin safety

Agents and plugins do not get unrestricted access by default.

Every major action routes through a shared tool registry in the desktop main process. Tools declare their capabilities upfront, like reading state, writing files, controlling the browser, starting processes, making network requests, or performing destructive actions.

The renderer is fully trusted as part of the core app, but agents and plugins face strict limits:

* read-only actions execute without interruption,
* file writes, browser control, process starts, and destructive actions require explicit permission or an approved grant,
* the host resolves plugin identity directly from the plugin tab itself, ignoring data the plugin sends,
* plugin tabs only access the `window.meithPlugin` APIs you specifically approve.

For agents, meith currently includes a built-in mock adapter for local testing and an ACP subprocess adapter for actual external agents. The ACP path allows an agent to use meith's tools without forcing the app to depend on a particular AI provider.

## Technical documentation

* [Architecture](https://www.google.com/search?q=./docs/ARCHITECTURE.md) covers the packages, boot path, services, persistence, renderer, CLI, agents, and plugins.
* [Tool protocol](https://www.google.com/search?q=./docs/TOOL_PROTOCOL.md) details the local socket protocol, tool result envelopes, capabilities, timeouts, cancellation, and caller policies.
* [Adding tools](https://www.google.com/search?q=./docs/ADDING_TOOLS.md) walks through adding a new tool to the shared registry.
* [Agent runtime](https://www.google.com/search?q=./docs/AGENT_RUNTIME.md) breaks down sessions, adapters, permissions, MCP bridging, and ACP subprocess integration.
* [Plugin API](https://www.google.com/search?q=./docs/PLUGIN_API.md) covers plugin manifests, installation, approved grants, `window.meithPlugin`, and the security model.

## Developer information

This repository is a pnpm monorepo containing four packages:

| Package | Purpose |
| --- | --- |
| `@meith/shared` | Shared Zod schemas, domain types, IDs, settings, app state, and `ToolResult` helpers. |
| `@meith/protocol` | Tool definitions, tool descriptors, NDJSON wire messages, naming helpers, and plugin API types. |
| `@meith/desktop` | Electron main process, preload bridges, React renderer, services, tools, socket server, plugins, provider-agnostic agent adapters, and packaging. |
| `@meith/cli` | The `meith` terminal command that talks to the running runtime socket. |

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
pnpm cli call app_health

```

Package the desktop app:

```bash
pnpm pack:desktop
pnpm dist:mac

```

## Release process

Releases are published as GitHub Releases with macOS arm64 desktop artifacts.

1. Choose the next semver version, such as `0.1.3`.
2. Update the `version` field in the root `package.json` and each package under `packages/`.
3. Update `packages/desktop/package.json` so `build.mac.bundleVersion` matches the release version.
4. Run the verification and build commands:

```bash
pnpm test
pnpm dist:mac

```

5. Check the generated artifact hashes:

```bash
shasum -a 256 packages/desktop/release/meith-<version>-mac-arm64.dmg packages/desktop/release/meith-<version>-mac-arm64.zip

```

6. Commit the version and documentation changes, then push `main`.
7. Publish the GitHub Release:

```bash
gh release create v<version> \
  packages/desktop/release/meith-<version>-mac-arm64.dmg \
  packages/desktop/release/meith-<version>-mac-arm64.zip \
  packages/desktop/release/meith-<version>-mac-arm64.dmg.blockmap \
  packages/desktop/release/meith-<version>-mac-arm64.zip.blockmap \
  --repo jouwdan/meith \
  --target main \
  --title "meith <version>" \
  --notes-file /path/to/release-notes.md

```

The current macOS release build is not Developer ID signed or notarized, so macOS may warn on first open.

On startup, the runtime writes `~/.meith/config.json`, registers the running instance under `~/.meith/instances/`, and exposes a managed launcher at `~/.meith/bin/meith`. Run `meith setup` for shell instructions, or `meith setup --write` to add that launcher directory to your shell config.
