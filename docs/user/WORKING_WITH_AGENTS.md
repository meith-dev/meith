---
title: Working with agents
description: Ask agents to act on your project, watch each tool call, and stay in control.
section: Using meith
sectionOrder: 1
order: 50
slug: agents
---

# Working with agents

## Agents work in your project's context

Open an agent chat tab inside a workspace and the agent operates within that
project. It can read and edit your app's code, run the dev server, drive an
embedded browser to check the live preview, and inspect dev-server logs. All of
that happens through the same shared tool registry the rest of the app uses.

## Provider-agnostic by design

meith does not lock you into one AI provider. The agent runtime uses an adapter
interface, and currently includes:

- a built-in **mock adapter** for local testing without any external model,
- an **ACP subprocess adapter** that connects to real external agents over the
  Agent Client Protocol.

The `ACP` path lets an agent use meith's tools without forcing the app to depend
on a particular AI vendor or SDK.

## You approve what matters

Agents do not get unrestricted access. Read-only work runs without interruption,
but anything that changes your machine pauses for approval:

- file writes,
- browser control,
- process starts,
- destructive actions.

You can remember an approval for the same tool for the rest of the session. ACP
provider-side approvals are narrowed to tools exposed by meith, so
provider-native helpers cannot bypass the shared registry.

> **Edits are reviewable**
>
> When an agent edits a file, the change lands as an inline diff with a gutter
> marker, so you can see exactly what was rewritten and undo it.

## Learn more

For how permissions and tool calls work under the hood, see
[Tools & permissions](/docs/tools). Developers integrating agents should read
the [Agent Runtime](/docs/developers/agent-runtime) reference.
