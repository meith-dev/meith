---
title: Getting started
description: Install meith, open a project, and run your first agent session.
section: Using meith
sectionOrder: 1
order: 20
slug: getting-started
---

# Getting started

## Install the app

meith is a free, open-source desktop app. It currently supports macOS on Apple
Silicon (M-series) only. Support for Intel Macs, Linux, and Windows is planned.
Download the latest build from [GitHub Releases](https://github.com/meith-dev/meith/releases),
then launch it like any other desktop application.

> **Builds in progress**
>
> meith is under active development and pre-built binaries may not be published
> yet. Until they are, you can build and run the app from source using the steps
> below.

## Run from source

meith is a pnpm monorepo. You need `Node.js 20+` and `pnpm 9+` installed.

```bash
# clone and install
git clone https://github.com/meith-dev/meith.git
cd meith
pnpm install

# launch the desktop app in development
pnpm dev
```

Other useful entry points while developing:

```bash
# renderer only, backed by an in-memory mock bridge
pnpm dev:renderer

# main-process services without Electron
pnpm --filter @meith/desktop dev:headless
```

## Open your first project

1. Launch meith. You start in a workspace backed by the built-in mock bridge
   until you open a real folder.
2. In the far-left **Spaces rail**, click the folder button to open a project
   folder, or the `+` button to create an empty workspace.
3. meith creates a space for that project. Browser tabs, editor tabs,
   terminals, and agent chats you open are scoped to it.

## Run your first agent session

1. Open an agent chat tab inside your workspace.
2. Ask it to build something concrete. For example: "add a pricing section to
   the landing page and start the dev server."
3. As the agent calls tools, each step appears inline. Read-only steps run
   immediately; actions that touch your machine pause for your permission.
4. Choose **Allow** or **Deny**. For agent tool prompts, you can remember the
   decision for that tool for the rest of the session.

## Set up the CLI

On startup the runtime writes `~/.meith/config.json`, registers the running
instance under `~/.meith/instances/`, and exposes a managed launcher at
`~/.meith/bin/meith`. Open the desktop app once, then use that launcher to add it
to your shell:

```bash
# print shell PATH setup instructions
~/.meith/bin/meith setup

# or write the launcher dir into your shell config
~/.meith/bin/meith setup --write

# after restarting your shell
meith app list
```

See [The meith CLI](/docs/cli) for the full command reference.
