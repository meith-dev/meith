# Plugin hooks and lifecycle

Choose the appropriate filter or event, understand execution order and failure isolation, and manage the lifecycle of an installed plugin. Start with the first-plugin tutorial if you have not run a plugin yet.

## Filters and events

| | What it gets | What happens to the return value |
|---|---|---|
| **Filter** | A value | It is used. Filters chain: each plugin receives what the previous one returned. |
| **Event** | A notification | Discarded. |

> [!TIP]
> Anything that only wants to *know* — logging, a webhook, a counter —
> should be an event. An event handler cannot corrupt the thing it is
> watching, even when it is wrong.

Both kinds can reach this plugin's runtime, so an event handler is where a
plugin reacts to the board durably: recording a row, queueing a delivery,
raising a notification. See [reaching the runtime from a
handler](#reaching-the-runtime-from-a-handler).

### Reaching the runtime from a handler

A handler's first two arguments are the value and the hook's own context.
Its **third is a function that resolves this plugin's runtime** — the same
`settings`, `logger`, `data`, `grants`, `users` and `notify` a task or a
route is handed:

```ts
'post.created': async (post, context, runtime) => {
  const { data } = await runtime()
  await data.query(
    'insert into plugin_example_outbox (post_id, queued_at) values ($1, now())',
    [post.postId],
  )
},
```

It is a function, not a value, for two reasons. Hooks are the hot path —
`view.*` filters run on every page and `postbit.badges` once per post — and
a handler that never calls it costs nothing, so the overwhelmingly common
pure-view filter pays for none of this. And acquiring the runtime can fail:
on a fixture-mode board there is no database, and `await runtime()` rejects
with a message that says so rather than handing back something that
pretends. Within a single handler call the runtime is resolved once and
reused, however many times it is asked for.

The reach is the same one everything else in the plugin gets, and no
larger: `data` still refuses anything outside `plugin_<key>_*`, `grants`
still refuses a group the operator has not opened, and a throw is still
contained and counted as [failure isolation](#failure-isolation) describes.
Testing a handler that uses it needs no board — `unavailableHookRuntime()`
stands in, and every capability on it refuses with the reason you pass:

```ts
filter(footer, viewer, unavailableHookRuntime('this test drives the filter directly'))
```

### Ordering

Handlers run in **(priority, plugin key)** order. Lower priority runs first;
the default is 100, so a plugin can insert on either side of an
unopinionated one without negative numbers. Both halves are declared and
total, so two plugins compose the same way on every request, on every
instance, in every deployment.

## Failure isolation

Every handler runs inside the host's try/catch:

| What happens | Result |
|---|---|
| A filter throws | The value is left as it was, and the chain continues with the next plugin |
| A filter returns `undefined` | Treated the same way — that is the shape of a handler that forgot to return |
| An event throws | Recorded and forgotten |

Nothing a plugin does propagates to the page. That makes plugin failures
survivable, **not invisible**: every failure is counted, logged with the
plugin key and the hook, and reported by `host.health()`.

Two limits and one guarantee are worth stating plainly, because a promise
with an unstated edge is worse than a smaller honest one:

**Auto-disable is durable.** Every failure is counted in a `plugin_health`
row, and the fifth switches the plugin off with the hook and the message
that did it. The row is the answer, not this process's tally: it survives a
restart, it is shared by every web instance and the worker, and each of them
reconciles against it. A plugin that started failing at 2am is off when the
platform recycles the instance at 3am, and off on the instance that never
saw it fail.

Nothing re-enables it on its own. An operator clears the record — **Clear
failures and re-enable** on `/admin/plugins`, which deletes the row and
takes effect on the next request across the board. Deliberately manual: a
plugin that fails five times and is switched back on by a timer fails five
more times, and the board has learned nothing.

> [!NOTE]
> A count that reaches the threshold is the *board's* count, not one
> instance's, so a plugin failing twice on each of three instances is
> switched off — which is the point of moving it out of memory.

**Timing is measured, never enforced.** Each call is timed, and slow ones
are logged and counted. There is no timeout, because JavaScript cannot abort
a handler: a `Promise.race` that "times out" returns control while the
handler keeps running, keeps its connection, and resolves later.

**UI contributions are isolated when they are built, not while they
render.** The host calls your `render` function inside a try/catch, so a
throw there drops your contribution and the region renders without it. A
component that throws later, inside React's own render, cannot be contained
from the server. So: build your markup in the function; do not return a
component that does work.

## The lifecycle

Four callbacks, each with one moment it runs and its own answer to "what if it
throws". All four are handed the same runtime context a task gets — resolved
settings, a logger, and `grants`, `data`, `users` and `notify`.

| Callback | When | If it throws |
|---|---|---|
| `onInstall` | The first `meith upgrade` on a board that has never recorded this plugin, after its migrations | The upgrade stops |
| `onEnable` | An operator switches the plugin on in the panel | The switch stands; counted as a plugin failure |
| `onDisable` | An operator switches it off | The switch stands; counted as a plugin failure |
| `onUninstall` | `meith plugin:purge <key>`, before anything is dropped | Nothing is dropped |

None of them runs inside the host's try/catch. That isolation exists to keep a
page rendering, and none of these is on a page.

**`onInstall` runs once per board, not once per deploy.** The board records a
`plugin:<key>` version row; no row means it has never seen the plugin. It runs
after that plugin's migrations, so its tables exist, and before the version row
is written, so a throw leaves the board able to try again. A throw stops the
upgrade — a plugin that could not finish installing is not one the board should
start serving.

**`onEnable` and `onDisable` run on the operator's switch only.** They do not
run on the host's own switch after repeated failures: a plugin that has just
failed five times is not one to hand more work to. They run *after* the switch
is written, so the callback sees the state it is being told about, and the
switch stands whatever they do — a callback that throws is the plugin's fault,
so it is counted and shown in the plugin's health row rather than reported to
the operator as their action having failed.

**`onUninstall` needs `meith plugin:purge`, and that is not a workaround.**
Removing a plugin is `pnpm remove`, taking it out of `meith.plugins.ts`
(`meith plugin:remove <key>` for a manifest entry, by hand for the escape
hatch) and a redeploy — and at the moment the board would call `onUninstall`,
the function is no longer in the build. There is no point in time where the
host holds both "this plugin is gone" and "this plugin's code". So the
operator says when:

```sh
meith plugin:purge dues          # says what it would do
meith plugin:purge dues --yes    # runs onUninstall, then drops the data
```

It runs `onUninstall` first and drops nothing if that throws, then takes away
the plugin's `plugin_<key>_*` tables, its settings, its migration records, its
navigation items, its version row and its health row. Then you remove the code.
Purging a plugin that is not in the build is refused, with that explanation:
there would be no `onUninstall` left to run.

The tables it drops are matched against the literal `plugin_<key>_` prefix, not a
pattern — the `_` in the prefix stands for itself, so a two-letter key like `mi`
takes only `plugin_mi_*` and never the board's own `plugin_migrations`. The
board's `plugin_migrations` and `plugin_health` tables are excluded outright as
well, so no key can reach them however short it is.

> [!TIP]
> Write these if the shape of your plugin wants them, but keep `onInstall`
> **idempotent anyway**. It runs once per board, and a board restored from a
> backup taken before the install is a board that will run it again.

## Versioning

`definePlugin` requires semver. The version is the plugin's own — it is
what the admin panel shows and what its migration history is recorded
against.

`apiVersion` declares which plugin-kit major the plugin was written
against. The same policy as the [theme API](theme-contract.md#versioning)
applies: a minor adds hooks, payload fields and regions; a major may remove
or rename one, and only after a deprecation cycle.

## What is wired, and what is not

An honest inventory, because the alternative is a document describing a
system that does not run. It is derived rather than remembered:
`scripts/hook-callsites.mjs` computes it by scanning the tree, so the
generated reference's wired column cannot drift from the code.

**All 102 hooks are wired.** Every entry in the registry has a call site in
the board, and the generated reference's wired column — computed from the
tree, not maintained by hand — says so. If that column ever reads anything
else, believe the column: it is derived and this sentence is not.

A hook that is declared but not wired would not be broken, only unfinished:
registering a handler for one is legal and does nothing. The reference marks
which is which so you find out before you ship, rather than after.

**`plugins/reference` must handle every wired hook**, enforced by its own
test. That is the ratchet: wiring a new call site into the board fails the
reference plugin's test until a handler is added there, so a hook cannot
join the running product without something proving it fires. The same
plugin declares a route of every shape, a board page, a secret setting with
an environment override and a select — and its tests drive each one, so
none of those surfaces can silently rot either.

### The descriptors execute

Everything declared runs today, the four lifecycle callbacks included — see
[the lifecycle](#the-lifecycle) for when each fires and what a throw costs.
Migrations are applied by `meith upgrade` in
dependency order, one transaction each. Settings are stored at
`plugin.<key>.<name>` and edited in the control panel, with environment
overrides resolved as described above. Tasks are registered as
`plugin.<key>.<id>` and run on the same tick as everything else. Admin
pages mount at `/admin/plugins/<key>/<path>`, routes at
`/api/plugins/<key>/<path>` (admin routes at
`/admin/api/plugins/<key>/<path>`), board pages at `/plugins/<key>/<path>`.
The runtime capabilities — `grants`, `data`, `users`, `notify` — are live on
every context; on a fixture-mode board they reject with a clear error
instead of pretending.

A few consequences, stated plainly:

- **A page cannot reach anything a task cannot.** Both are handed the
  runtime context — resolved settings and a logger — and neither gets the
  `Actor`, the request, or a database handle. An admin page additionally
  sees the panel URL's query string, which is what a post-redirect-get
  notice needs and nothing more. There is no per-page permission to
  declare, because a plugin does not get to make that decision; the acting
  half lives on routes, where `access: 'admin'` is checked and logged by
  the host.
- **A task's failure is not swallowed.** Hooks are isolated because the
  alternative is a plugin taking down a page render. A task has no page to
  take down, and the scheduler already records failures and notifies
  administrators — catching there would turn every failure into a
  successful run of nothing.
- **There is no plugin-run button for migrations**, and there will not be.
  A schema change belongs to the deploy that shipped the code expecting
  it. The panel reports which migrations have and have not been applied,
  which is the part an operator cannot otherwise find out.
- **Disabling is durable and immediate; uninstalling is a command, not a
  button.** Both switches — the panel's and the host's own, after repeated
  failures — write a row that every instance reconciles against on its next
  request, so both survive a redeploy: the plugin somebody switched off at
  2am is exactly the one that must stay off. Removing a plugin is still
  `pnpm remove`, a line out of `meith.plugins.ts`, and a redeploy, with
  `meith plugin:purge` before it when its data should go too. There is
  no button, because a button that dropped the rows while the code kept
  running would produce a state neither installing nor removing does.
