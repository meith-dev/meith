# The plugin API, v1

`@forum/plugin-kit` is the contract between the board and a plugin. This document
is the policy: what a plugin is, what it may and may not do, how failures are
handled, and what the guarantees actually cover. The reference — every hook,
every payload — is generated into [`plugin-hooks.md`](./plugin-hooks.md).

## What a plugin is

A module that calls `definePlugin` with a manifest and is registered in
`forum.config.ts`. It declares:

| | |
|---|---|
| `hooks` | Handlers for named hooks. Filters change a value; events observe. |
| `settings` | Settings the ACP will render, stored under `plugin.<key>.<name>`. |
| `migrations` | Forward-only SQL, applied in ascending id order and recorded per plugin. |
| `tasks` | Scheduled work, registered as `plugin.<key>.<id>` and run by the same tick as core's. |
| `adminPages` | Pages mounted under `/admin/plugins/<key>/`. |
| `contributions` | Markup in named UI regions. |
| `onInstall` / `onEnable` / `onDisable` / `onUninstall` | Lifecycle callbacks. |

Everything but the callbacks is **declarative**. A plugin does not call
`registerHook` at import time — it exports an object and the host reads it.
Registration by side effect makes the installed set depend on module evaluation
order, which differs between the dev server, a bundled build and the worker, and
is the direct cause of the "works locally, missing in production" class of
plugin bug.

Installing a plugin is `pnpm add`, a line in `forum.config.ts`, and a redeploy.
There is no upload-a-zip path and there will not be one: a serverless bundle
contains only what the bundler saw (invariant 6), so a plugin discovered at
runtime is a plugin that is not there in production.

## What a plugin cannot do

These are not discouraged. There is no API for them.

- **Decide authorization.** No hook filters `authorization.can()`, and none ever
  will. A plugin able to change that answer is a plugin able to grant itself
  anything.
- **Reach inside the visibility filter.** No hook sits in F47's query path. A
  plugin that could rewrite a `where` clause could publish a private forum, and
  no amount of isolation makes that recoverable.
- **See an `Actor`.** Payloads carry `{ userId, isGuest }`. An `Actor` carries
  resolved group membership, which invites a plugin to make its own permission
  decision from group ids — exactly what R4 forbids of core code.
- **Open a database connection.** Migrations are SQL text the host runs; a
  plugin does not import `@forum/db`.
- **Patch core.** There is no monkey-patching seam and no way to replace a
  domain command. Everything a plugin can do is in the registry.
- **Fill a theme slot.** A theme owns its slots. Plugins contribute to *regions*
  — see below.

## Filters and events

A **filter** is handed a value and returns a replacement. Its result is used, so
a filter is powerful and correspondingly dangerous. Filters chain: each plugin
receives what the previous one returned.

An **event** is told something happened and its return value is discarded.
Anything that only wants to *know* — logging, a webhook, a counter — must be an
event, because an event handler cannot corrupt the thing it is watching even
when it is wrong.

Handlers run in **(priority, plugin key)** order. Lower priority runs first; the
default is 100, so a plugin can insert either side of an unopinionated one
without negative numbers. Both halves are declared and total, so two plugins
compose the same way on every request, on every instance and in every
deployment. Nothing depends on registration order or on how `forum.config.ts`
happens to list its plugins.

```ts
export const greeter = definePlugin({
  key: 'greeter',
  name: 'Greeter',
  version: '1.0.0',
  hooks: {
    'view.footer': (footer) => ({
      ...footer,
      links: [...footer.links, { label: 'Rules', href: '/rules' }],
    }),
    'post.created': { handler: (post) => report(post.postId), priority: 200 },
  },
})
```

## Failure isolation, and what it does not cover

Every handler runs inside the host's try/catch:

- a **filter** that throws leaves the value as it was, and the chain continues
  with the next plugin;
- a filter that returns `undefined` — the shape of a handler that forgot to
  return — is treated the same way;
- an **event** that throws is recorded and forgotten.

Nothing a plugin does propagates to the page. That makes plugin failures
survivable, **not invisible**: every failure is counted, logged with the plugin
key and the hook, and reported by `host.health()`.

Three limits, stated plainly because a guarantee with an unstated edge is worse
than a smaller honest one:

**Auto-disable is per instance and in memory.** A plugin that has failed five
times is switched off for the rest of that process and does not re-enable itself
— a plugin that recovers silently means the operator never learns their board
spent a day without the feature they installed. But the counter resets whenever
the platform recycles the instance. Auto-disable protects a request path within
one instance; switching a plugin off across the board is an operator action.

**Timing is measured, never enforced.** Each call is timed and slow ones are
logged and counted. There is no timeout, because JavaScript cannot abort a
handler: a `Promise.race` that "times out" returns control while the handler
keeps running, keeps its connection, and resolves later. That is not a timeout.

**UI contributions are isolated when they are built, not while they render.**
The host calls your `render` function inside a try/catch, so a throw there drops
your contribution and the region renders without it. A node that throws during
React's own render cannot be contained from the server: catching that needs an
error boundary, and error boundaries are client components. So build your markup
in the function; do not return a component that does work.

## UI regions

Regions are not theme slots, and the distinction is deliberate. If a plugin
could fill a slot, an installed plugin would decide what a post looks like and
two plugins filling the same slot would have to be resolved somehow.

A region is the other arrangement: an explicit "plugins may add something here"
point that a *theme* renders. The theme keeps control of where plugin output
appears; the plugin keeps control of what it is; several plugins compose by
concatenation in the usual deterministic order.

There are six, listed in [`plugin-hooks.md`](./plugin-hooks.md). The list is
short on purpose — every region is a commitment every theme has to render or
silently drop.

## Namespacing

A plugin's key namespaces everything it registers, and the host builds the names
so a plugin cannot collide with another or reach a core one:

| | |
|---|---|
| Setting | `plugin.<key>.<setting>` |
| Task | `plugin.<key>.<task>` |
| Admin page | `/admin/plugins/<key>/<path>` |

`definePlugin` refuses a key, setting name, task id or page path that would not
namespace cleanly — a dot in a plugin key produces an ambiguous setting key, and
a slash in a page path escapes the admin prefix.

## Migrations

Forward-only, like core's, and for the same reason (invariant 32): a down
migration that drops a column is a data-loss button on a live board.

Ids look like `0001_add_table` and are applied in **sort** order. `definePlugin`
refuses a list that is not written in ascending order, because the failure is
silent: a fresh board applies everything, an upgraded board skips the id that
sorts before the last one applied, and the two boards end up with different
schemas and no error anywhere.

## Versioning

`definePlugin` requires semver, and the version is the plugin's own — it is what
the ACP shows and what its migration history is recorded against.

`apiVersion` declares which plugin-kit major the plugin was written against. The
same policy as the theme API applies: a minor adds hooks, payload fields and
regions; a major may remove or rename one, and only after a deprecation cycle.

## The generated reference is a gate

[`plugin-hooks.md`](./plugin-hooks.md) is written by
`scripts/plugin-hook-docs.mjs` from the registry. `pnpm verify` and CI run
`pnpm plugin:docs:check`, which fails when the file and the code disagree.

Hook documentation goes stale faster than most, because a hook is added in the
feature that needs it and documented, if at all, afterwards. If the check fails,
run `pnpm plugin:docs` and commit the result.

## What is wired, and what is not

Honest inventory, because the alternative is a document describing a system that
does not run — and it is derived rather than remembered.

**21 of the 91 hooks are wired**: the shell filters, the index, forum, thread,
member, search and error-page view models, and the three posting events. The
generated reference marks each hook's column, and
`scripts/hook-callsites.mjs` computes it by scanning the tree, so the column
cannot drift from the code.

A hook that is declared but not wired is not broken — it is a call site that has
not been written. Registering a handler for one is legal, does nothing, and the
reference marks it so you find out before you ship.

**`plugins/reference` must handle every wired hook**, enforced by its own test.
That is the ratchet: wiring a new call site into the board fails the reference
plugin's test until a handler is added there, so a hook cannot join the running
product without something proving it fires.

Still descriptors rather than execution: migrations are validated and namespaced
but no runner applies them, settings are declared but no ACP surface reads
`plugin.<key>.<name>`, tasks are declared but not registered into F06's
registry, and admin pages have no route mounting them. All four are F69's
completion, whose row has named F79 as its blocker since Phase 6.
