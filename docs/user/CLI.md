---
title: The meith CLI
description: Inspect and control a running meith runtime from your terminal with the meith command.
section: Using meith
sectionOrder: 1
order: 80
slug: cli
---

# The meith CLI

## Setup

On startup the runtime registers the running instance and exposes a managed
launcher at `~/.meith/bin/meith`. Open the desktop app once, then use that
launcher to add it to your shell:

```bash
# print shell PATH setup instructions
~/.meith/bin/meith setup

# or write the launcher dir into your shell config
~/.meith/bin/meith setup --write

# after restarting your shell
meith app list
```

Through the monorepo you can also run the CLI with `pnpm cli <command>`.

## Launching & projects

```bash
meith                 # launch the app
meith ./my-project    # launch and open a project path
meith new my-app      # create and open a new project
```

## Tools & generic calls

Every runtime capability is a tool. List them, or invoke any tool by its exact
name with `meith call`:

```bash
meith tools                  # list every tool the runtime exposes
meith call app_health        # invoke any registered tool by name
meith call <tool> --help     # inspect a tool's parameters
```

## Common commands

Friendly commands map to the registered desktop tools. The full list is
available with `meith --help`; common groups include:

- `meith tabs`: list browser and workspace tabs.
- `meith open <url>`: open a new browser tab at a URL.
- `meith active-tab`: show the active browser tab.
- `meith browser-state <tabId>`: inspect interactable browser elements for
  automation.
- `meith click <tabId> <elementId>`, `meith type <tabId> <elementId> <text>`,
  and `meith keys <tabId> <keys>`: automate a tab.
- `meith spaces`, `meith create-space <name>`, and
  `meith open-workspace-tab <title> <cwd>`: manage spaces and workspace tabs.
- `meith projects`, `meith open-project <cwd>`, `meith templates`, and
  `meith create-project <template>`: manage projects and templates.
- `meith files <cwd>`, `meith read <cwd> <path>`, `meith search <cwd> <query>`,
  and `meith diagnostics <cwd> [path]`: inspect workspace files.
- `meith diff <cwd>`: summarize the git working tree.
- `meith app list`: inspect running app instances.
- `meith health`: print runtime service health.
- `meith dev-servers`: list managed dev servers and their port.
- `meith start-dev <cwd> <command>`: start a dev server.
- `meith devlogs`: stream a dev server's logs.
- `meith processes`: list managed child processes.
- `meith settings`, `meith storage`, and `meith plugins`: inspect settings,
  durable storage, and installed plugins.

> Run `meith --help` for the full command list, or `meith <command> --help` for
> command-specific details. When the runtime is reachable, help is enriched with
> each tool's live parameter schema.

## Useful options

- `--json`: print the raw `ToolResult` envelope.
- `--instance <id>`: target a specific instance by pid or label.
- `--socket <path>`: override the runtime socket path.
- `--timeout <ms>`: per-call timeout override.
- `--arg-json <json>` / `--stdin`: pass complex params as JSON.
