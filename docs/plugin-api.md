# The plugin API

`@meith/plugin-kit` is the contract between the board and a plugin.

This document is the policy — what a plugin is, what it may and may not do, and
what the guarantees actually cover. The reference (every hook, every payload) is
generated into [Plugin hooks](./plugin-hooks.md).

## Writing a plugin

A plugin is a module that calls `definePlugin` and is registered in
`forum.plugins.ts` — the installed list lives in its own file, beside
`forum.config.ts`, so the operator CLI can read it without importing the
themes' component trees.

```ts
export const greeter = definePlugin({
  key: "greeter",
  name: "Greeter",
  version: "0.1.0",
  hooks: {
    // A filter: what it returns replaces the value.
    "view.footer": (footer) => ({
      ...footer,
      links: [...footer.links, { label: "Rules", href: "/rules" }],
    }),
    // An event: its return value is discarded.
    "post.created": { handler: (post) => report(post.postId), priority: 200 },
  },
})
```

Installing it is `pnpm add`, a line in `forum.plugins.ts`, and a redeploy.

### What a plugin can declare

| Field | What it is |
|---|---|
| `hooks` | Handlers for named hooks. Filters change a value; events observe. |
| `settings` | Settings the admin panel renders, stored under `plugin.<key>.<name>`. |
| `migrations` | Forward-only SQL, applied in ascending id order and recorded per plugin. |
| `tasks` | Scheduled work, registered as `plugin.<key>.<id>` and run by the same tick as core's. |
| `adminPages` | Pages mounted under `/admin/plugins/<key>/`. |
| `contributions` | Markup in named UI regions. |
| `onInstall` / `onEnable` / `onDisable` / `onUninstall` | Lifecycle callbacks — declared and typed, not yet dispatched by the host. See the inventory below. |

> [!NOTE]
> Everything but the callbacks is **declarative**. A plugin does not call
> `registerHook` at import time — it exports an object and the host reads it.
>
> Registration by side effect makes the installed set depend on module evaluation
> order, which differs between the dev server, a bundled build and the worker.
> That is the direct cause of the "works locally, missing in production" class of
> plugin bug.

## What a plugin cannot do

These are not discouraged. There is no API for them.

| It cannot | Why |
|---|---|
| Decide authorization | No hook filters `authorization.can()`, and none ever will. A plugin able to change that answer is a plugin able to grant itself anything |
| Reach inside the visibility filter | No hook sits in the query path. A plugin that could rewrite a `where` clause could publish a private forum, and no amount of isolation makes that recoverable |
| See an `Actor` | Payloads carry `{ userId, isGuest }`. An `Actor` carries resolved group membership, which invites a plugin to make its own permission decision from group ids |
| Open a database connection | Migrations are SQL text the host runs. A plugin does not import `@meith/db` |
| Patch core | There is no monkey-patching seam and no way to replace a domain command |
| Fill a theme slot | A theme owns its slots. Plugins contribute to *regions* — see below |

## Filters and events

| | What it gets | What happens to the return value |
|---|---|---|
| **Filter** | A value | It is used. Filters chain: each plugin receives what the previous one returned |
| **Event** | A notification | Discarded |

> [!TIP]
> Anything that only wants to *know* — logging, a webhook, a counter — should be
> an event. An event handler cannot corrupt the thing it is watching even when it
> is wrong.

### Ordering

Handlers run in **(priority, plugin key)** order. Lower priority runs first; the
default is 100, so a plugin can insert on either side of an unopinionated one
without negative numbers.

Both halves are declared and total, so two plugins compose the same way on every
request, on every instance, in every deployment. Nothing depends on registration
order or on how `forum.config.ts` happens to list its plugins.

## Failure isolation

Every handler runs inside the host's try/catch.

| What happens | Result |
|---|---|
| A filter throws | The value is left as it was, and the chain continues with the next plugin |
| A filter returns `undefined` | Treated the same way — that is the shape of a handler that forgot to return |
| An event throws | Recorded and forgotten |

Nothing a plugin does propagates to the page. That makes plugin failures
survivable, **not invisible**: every failure is counted, logged with the plugin
key and the hook, and reported by `host.health()`.

### Three limits worth stating

A guarantee with an unstated edge is worse than a smaller honest one.

> [!WARNING]
> **Auto-disable is per instance and in memory.** A plugin that has failed five
> times is switched off for the rest of that process, and does not re-enable
> itself — a plugin that recovered silently would mean the operator never learned
> their board spent a day without the feature they installed. But the counter
> resets whenever the platform recycles the instance.
>
> Auto-disable protects a request path within one instance. Switching a plugin
> off across the board is an operator action.

**Timing is measured, never enforced.** Each call is timed, and slow ones are
logged and counted. There is no timeout, because JavaScript cannot abort a
handler: a `Promise.race` that "times out" returns control while the handler
keeps running, keeps its connection, and resolves later. That is not a timeout.

**UI contributions are isolated when they are built, not while they render.** The
host calls your `render` function inside a try/catch, so a throw there drops your
contribution and the region renders without it. A node that throws during React's
own render cannot be contained from the server — catching that needs an error
boundary, and error boundaries are client components.

So: build your markup in the function. Do not return a component that does work.

## UI regions

Regions are not theme slots, and the distinction is deliberate. If a plugin could
fill a slot, an installed plugin would decide what a post looks like — and two
plugins filling the same slot would have to be resolved somehow.

A region is the other arrangement: an explicit "plugins may add something here"
point that a *theme* renders.

- The theme keeps control of **where** plugin output appears.
- The plugin keeps control of **what** it is.
- Several plugins compose by concatenation, in the usual deterministic order.

There are six, listed in [Plugin hooks](./plugin-hooks.md). The list is short on
purpose — every region is a commitment every theme has to render or silently
drop.

## Namespacing

A plugin's key namespaces everything it registers, and the host builds the names,
so a plugin cannot collide with another or reach a core one.

| Thing | Name it gets |
|---|---|
| Setting | `plugin.<key>.<setting>` |
| Task | `plugin.<key>.<task>` |
| Admin page | `/admin/plugins/<key>/<path>` |

One name in that namespace is the host's: `plugin.<key>._enabled` is the
operator's kill switch. A plugin cannot declare it — setting names cannot start
with an underscore — which is what makes the collision impossible rather than
unlikely.

`definePlugin` refuses a key, setting name, task id or page path that would not
namespace cleanly — a dot in a plugin key produces an ambiguous setting key, and
a slash in a page path escapes the admin prefix.

## Migrations

Forward-only, like core's, and for the same reason: a down migration that drops a
column is a data-loss button on a live board.

Ids look like `0001_add_table` and are applied in **sort** order.

> [!IMPORTANT]
> `definePlugin` refuses a migration list that is not written in ascending order,
> because the failure is otherwise silent: a fresh board applies everything, an
> upgraded board skips the id that sorts before the last one applied, and the two
> boards end up with different schemas and no error anywhere.

## Versioning

`definePlugin` requires semver. The version is the plugin's own — it is what the
admin panel shows and what its migration history is recorded against.

`apiVersion` declares which plugin-kit major the plugin was written against. The
same policy as the theme API applies: a minor adds hooks, payload fields and
regions; a major may remove or rename one, and only after a deprecation cycle.

## What is wired, and what is not

An honest inventory, because the alternative is a document describing a system
that does not run. It is derived rather than remembered:
`scripts/hook-callsites.mjs` computes it by scanning the tree, so the generated
reference's column cannot drift from the code.

**25 of the 95 hooks are wired** — the shell filters, the view models of every
reading surface, and the three posting events. The generated reference's wired
column is the authoritative list.

A hook that is declared but not wired is not broken; it is a call site that has
not been written. Registering a handler for one is legal, does nothing, and the
reference marks it so you find out before you ship.

**`plugins/reference` must handle every wired hook**, enforced by its own test.
That is the ratchet: wiring a new call site into the board fails the reference
plugin's test until a handler is added there, so a hook cannot join the running
product without something proving it fires.

**The lifecycle callbacks do not run yet.** `onInstall`, `onEnable`,
`onDisable` and `onUninstall` are part of the declared shape and validated like
everything else, but no host code dispatches them today. Write them if the
shape of your plugin wants them — just do not put anything there that must run
for the plugin to be correct.

### The four descriptors execute

Migrations are applied by `forum upgrade` in dependency order, one transaction
each. Settings are stored at `plugin.<key>.<name>` and edited in the control
panel. Tasks are registered as `plugin.<key>.<id>` and run by the same tick as
everything else. Admin pages are mounted at `/admin/plugins/<key>/<path>`.

What that leaves, stated plainly:

- **A page cannot reach anything a task cannot.** Both are handed a
  `PluginRuntimeContext` — resolved settings and a logger — and neither gets the
  `Actor`, the request, or a database handle. A page renders under an
  already-authenticated panel route; there is no per-page permission to declare,
  because a plugin does not get to make that decision.
- **A task's failure is not swallowed.** Hooks are isolated because the
  alternative is a plugin taking down a page render. A task has no page to take
  down, and the scheduler already records failures and notifies administrators —
  catching there would turn every failure into a successful run of nothing.
- **There is no plugin-run button for migrations**, and there will not be. A
  schema change belongs to the deploy that shipped the code expecting it. The
  panel reports which migrations have and have not been applied, which is the
  part an operator cannot otherwise find out.
- **Disabling is durable and immediate; uninstalling is not offered.** The
  panel's switch writes a row that every instance reconciles against on its next
  request, so it survives a redeploy — the plugin somebody switched off at 2am is
  exactly the one that must stay off. Removing a plugin is `pnpm remove`, a line
  out of `forum.plugins.ts`, and a redeploy; a button that dropped the rows and
  left the code running would produce a state neither installing nor removing
  does.

## The generated reference is a gate

[Plugin hooks](./plugin-hooks.md) is written by `scripts/plugin-hook-docs.mjs`
from the registry. `pnpm verify` and CI run `pnpm plugin:docs:check`, which fails
when the file and the code disagree.

Hook documentation goes stale faster than most, because a hook is added in the
feature that needs it and documented, if at all, afterwards.

If the check fails, run `pnpm plugin:docs` and commit the result.
