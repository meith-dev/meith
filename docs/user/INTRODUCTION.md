---
title: Introduction
description: meith is a desktop workbench for building web apps with AI.
section: Using meith
sectionOrder: 1
order: 10
slug: /
---

# Introduction

meith collects the pieces web developers usually scatter across multiple windows:
project folders, code files, terminal sessions, a live localhost preview, run
commands, dev-server logs, plugins, and agent chats. A shared tool system
connects everything, so the visual app, the terminal command, a plugin, and an
AI agent all act on the same project state instead of isolated views.

The name comes from the Irish *meitheal*: a group of people coming together to
work on a common task. In meith, the app, command line, plugins, and agents
gather around a single workspace.

## What you can do with it

- Open a web project folder in its own workspace.
- Browse and edit your app's code in the integrated editor.
- Start and stop your dev server from the top bar.
- Preview the running app on localhost in an embedded browser tab.
- Watch the preview update and read dev-server logs in the window.
- Split panes to arrange your preview, editor, terminal, or agent side by side.
- Ask an agent to build features in your project's context: editing files,
  running the dev server, and checking the live preview.
- Review and commit working-tree changes in a Git panel with top-bar branch
  switching, summary counts, staged/unstaged sections, and lazy-loaded file
  patches.
- Install web-app plugins and explicitly approve the APIs they can use.
- Use the `meith` terminal command to inspect and control a running app
  instance.

## Not locked into one AI provider

meith does not tie you to a single model vendor. The agent runtime uses an
adapter interface and connects to external agents via `ACP` (Agent Client
Protocol), keeping the desktop app independent of any specific AI provider or
SDK.

## Where to next

- [Getting started](/docs/getting-started): install meith, open your first
  project, and run your first agent session.
- [Workspaces & tabs](/docs/spaces): how spaces map to projects, and how tabs
  organize your work.
- [Working with agents](/docs/agents): ask agents to build features in your
  project and review what they do.
- [Tools & permissions](/docs/tools): how the shared tool registry keeps you in
  control of every action.
