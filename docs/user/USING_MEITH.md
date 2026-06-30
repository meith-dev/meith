---
title: Using meith
description: A tour of the meith workbench and the everyday loop of opening a project, running it, and working alongside an agent.
section: Using meith
sectionOrder: 1
order: 30
slug: using-meith
---

# Using meith

meith is a single window that gathers the things you normally spread across an
editor, a terminal, a browser, and a chat app while building a web app. Once you
know where each surface lives, the daily loop is fast: open a project, split a
couple of panes, start the dev server, and let an agent build features while you
watch the preview update at every step.

## The workbench at a glance

meith is a fixed desktop shell rather than a scrolling web page. From the
outside in, the window is made of a few stable regions:

- A custom **title bar** across the top, with the meith mark, the active
  project's run controls, and window chrome.
- The far-left **Spaces rail**, an icon rail that works like a profile switcher,
  with one avatar per open project and buttons to create a workspace or open a
  folder.
- The central **workspace**, where your editor, browser, terminal, agent, and
  plugin tabs live and can be split into panes.
- A collapsible **diagnostics drawer** along the bottom for terminal output and
  dev-server logs.
- A **status bar** footer that shows live signals such as how many dev servers
  are running and on which port, plus whether the runtime is connected.

## A typical session

1. Open a project folder from the Spaces rail. meith creates a space for it and
   scopes every tab you open to that project.
2. Split the workspace so you can see more than one thing at once. A common
   layout is an agent chat on the left and a live `localhost` preview on the
   right. Clicking inside either pane makes that pane active; its active tab is
   highlighted in orange.
3. Start your project's run command from the title bar. The status bar shows the
   running server and its port, and the embedded browser tab can point straight
   at it.
4. Ask the agent to build something concrete: a component, a page, or a feature.
   As it calls tools, each step appears inline; read-only steps run immediately
   and anything that touches your machine pauses for approval.
5. Watch the preview update and check the diagnostics drawer for logs as changes
   land.

## Reviewing what changed

When an agent edits files, the edits are not a black box. meith reads a
project's working-tree changes, including staged, unstaged, and brand-new files,
and presents them as per-file diffs with added and removed line counts. You can
see exactly what was rewritten before you keep it.

The Git panel opens on the right by default. From a single-pane layout, opening
Git changes starts split view; from an existing split layout, it focuses or
moves the Git tab into the right pane. The tab remains draggable if you want a
different arrangement.

Use **Stage all** to move every visible unstaged or untracked file into the
index, or stage and unstage individual files from the selected file header. The
commit composer can ask the configured ACP agent for a Conventional Commit
subject using the full staged diff; if nothing is staged, it uses the full
working-tree diff and falls back to a local heuristic when no real agent is
configured.

The top header shows the current branch for the active workspace. Open it to
switch to another local branch or create a new branch and switch to it. The
current branch stays pinned at the top of the menu, long branch lists scroll,
and the create-branch action remains visible at the bottom.

Git settings include saved commit identities for switching between accounts.
Choose **Use Git config** to keep repository/global `user.name` and `user.email`
behavior, or select a saved profile so commits made from Meith use that name and
email as both author and committer. The settings panel can detect profile
suggestions from effective repo config, global Git config, and installed
provider CLIs such as `gh` and `glab`; it saves a suggestion only after you add
it.

> **Edits are reversible**
>
> File edits land as reviewable diffs, and a workspace-level undo lets you roll
> back the last write if a change was not what you wanted.

## Staying in control

Everything an agent or plugin does flows through one shared tool registry, and
privileged actions stop for your sign-off. When a tool wants to write a file,
control the browser, start a process, or do something destructive, meith pauses
and asks. You can:

- **Allow** to permit the action,
- use **Remember for this tool in this session** when you want the same agent
  tool to keep running without another prompt, or
- **Deny** to stop it.

Read-only work never interrupts you, and every call is audited. See
[Tools & permissions](/docs/tools) for the full model.

## Driving it from the terminal

meith also answers to a command line. The `meith` command talks to the running
app over a local socket and calls the exact same tools the window uses, so you
can open tabs, inspect dev servers, or stream logs without leaving your shell.
Open the desktop app once, then run `~/.meith/bin/meith setup` to add it to your
`PATH`. After restarting your shell, explore with [The meith CLI](/docs/cli).

## Go deeper

- [Workspaces & tabs](/docs/spaces): how spaces map to projects, and how tabs
  and split panes organize your work.
- [Working with agents](/docs/agents): put an agent to work in your project's
  context and review every action.
- [Plugins](/docs/plugins): extend meith with web-app plugins and approve
  exactly what they can touch.
- [The meith CLI](/docs/cli): inspect and control a running runtime from your
  terminal.
