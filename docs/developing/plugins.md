# The plugin API

`@meith/plugin-kit` is the contract between the board and a plugin.

This document is the policy: what a plugin is, what it may and may not do,
and what the guarantees cover. The reference, every hook and every payload,
is generated into [Plugin hooks](../reference/plugin-hooks.md). To
**install** an existing plugin on a board you run, see
[Installing plugins and themes](../getting-started/installing.md).

## Writing a plugin

A plugin is a module that calls `definePlugin`. `meith.plugins.ts` is the
installed list, kept in its own file beside `meith.config.ts` so the operator
CLI can read it without importing the themes' component trees. It is
**generated** from `board.plugins.json`, and that manifest is the
installation path for any plugin that fits it:

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

**Fitting the manifest** means the package's entry point exports the
finished plugin under two fixed names, built with no arguments. Its own
configuration comes from [settings](#settings) rather than a constructor,
the way `plugins/dues`'s plans moved there:

```ts
// index.ts of @meith/plugin-greeter
export { greeter as plugin } from './definition'
export { greeterMessages as messages } from './messages'
```

A plugin ships TypeScript source, the way every `@meith/*` package does.
The board build compiles every dependency named in the board's own
`package.json` from source (they join Next's `transpilePackages`), so there
is no build step to ship. `scripts/extension-workspace-smoke.mts` proves
this path end to end against a scaffolded plugin.

### Installing a plugin

Installing one into a board you run is `meith plugin:add <package>`, then a
commit and a redeploy; [Installing plugins and
themes](../getting-started/installing.md) covers it. This section is the
mechanics underneath, and the two-board shape this repository carries.

`plugin:add` records the package in `board.plugins.json` and regenerates
`meith.plugins.ts`. In a board the CLI writes the file itself. **This
repository's** checkout carries two boards: `apps/community`, the in-repo dev
target, and `boards/stock`, the workspace `docker/Dockerfile` builds the
official image from (see `docs/reference/architecture.md`, "The board-config
seam"). Their two `board.plugins.json` files must stay identical
(`tests/boards-stock.test.ts` is the drift guard `pnpm verify` runs), so the
package has to be a dependency of both, and `plugin:add` writes both
manifests:

```sh
pnpm add @meith/plugin-greeter --filter @meith/web
pnpm add @meith/plugin-greeter --filter @meith/board-stock
meith plugin:add @meith/plugin-greeter
```

`plugin:add` infers the manifest key from a `@scope/plugin-<key>` package
name. Pass `--key` when the name does not fit that shape, or `--disabled` to
install it switched off. It writes the manifest:

```json
{ "plugins": [{ "key": "greeter", "package": "@meith/plugin-greeter", "enabled": true }] }
```

then regenerates `meith.plugins.ts` from it with the import and the list
entry. A board's CLI writes the file directly; this repository runs
`pnpm board:gen` across both boards. `meith plugin:remove <key>` is the
reverse. If regenerating refuses a manifest, most often because the package
is not yet a dependency, or in this repo because the two manifests already
disagree, the `board.plugins.json` edit is rolled back (every board together,
in the repo). Neither command takes plugin configuration: the manifest has
no field for it, and `plugin:add` refuses an attempt to pass any. A plugin
that needs arguments is not manifest-installable until its configuration
moves into its own settings.

**The escape hatch is real code.** A plugin that cannot yet fit the manifest,
because it takes constructor configuration or you are still writing it, is
registered by hand. In a board, add its import and `INSTALLED_PLUGINS` entry
to `meith.plugins.ts` directly, and keep it out of `board.plugins.json` so a
later `plugin:add` does not regenerate the file and drop it. In **this
repository** a hand-written entry goes in `meith.demo.plugins.ts` instead,
spread into the generated list through `showcasePlugins()`, which the
generator preserves as a fixed extension point.

`pnpm board:gen:check`, wired into `pnpm verify`, fails when either board's
manifest and its `meith.plugins.ts` disagree: run `pnpm board:gen` and commit
the result. `tests/boards-stock.test.ts` fails when the two
`board.plugins.json` files disagree with each other. Each `board.plugins.json`
refuses: a duplicate key; a key `definePlugin` would refuse; a key whose
camelCase identifier collides with another entry's, or is not itself a valid
identifier (`foo--bar` and `foo-` are legal plugin keys that would make
`meith.plugins.ts` un-generatable); a non-boolean `enabled`; a `package` that
is not a valid npm package name; and a package its own board does not depend
on, naming the fix (`pnpm add <package> --filter @meith/web` for
`apps/community`, `pnpm add <package> --filter @meith/board-stock` for
`boards/stock`). `apps/cli/src/board-eject.ts` renders the same shape of
`meith.plugins.ts` for an ejected board and carries its own copy of the
key/identifier/`enabled`/package-name checks, not the dependency check. The
two `toIdentifier` implementations are pinned to agree by a test in
`board-eject.test.ts` rather than shared, for the same reason
`plugin-manifest.ts` shells out to the generator: a plain script and a
workspace TypeScript package cannot share a module.

> [!TIP]
> **[`examples/hello-plugin`](https://github.com/meith-dev/meith/tree/main/examples/hello-plugin)
> is the worked example to copy**: the smallest plugin that does something
> visible with each extension point. A footer-link filter, a region
> contribution, a setting, a migration, a task and an admin page, each with
> a comment explaining its shape. It ships as reference code, not installed;
> [`examples/README.md`](https://github.com/meith-dev/meith/tree/main/examples)
> walks through registering it or your copy of it.
>
> `npx create-meith --plugin my-plugin` scaffolds a standalone workspace
> whose source and passing test are generated from that example
> (`pnpm extension:gen` in this repository, so the two cannot drift), plus a
> README and a pre-filled marketplace `listing.json`.

### What a plugin can declare

| Field | What it is |
|---|---|
| `hooks` | Handlers for named hooks. Filters change a value; events observe. |
| `settings` | Settings the admin panel renders, stored under `plugin.<key>.<name>`. |
| `migrations` | Forward-only SQL, applied in ascending id order and recorded per plugin. |
| `tasks` | Timed work on a fixed cadence or a [UTC cron schedule](#scheduled-tasks), registered as `plugin.<key>.<id>` and run by the same tick as core's tasks. |
| `adminPages` | Pages mounted under `/admin/plugins/<key>/`. |
| `routes` | HTTP endpoints mounted under `/api/plugins/<key>/`, dispatched by the host. |
| `pages` | Member-facing pages mounted under `/plugins/<key>/`, rendered inside the board's shell; a page marked `access: 'staff'` mounts inside the moderation panel instead. |
| `navigation` | Board navigation entries the operator then owns. See [below](#asking-for-a-place-in-the-navigation). |
| `notifications` | Notification kinds this plugin may send, each a line on the member's preferences screen. |
| `allowedRedirectHosts` | The only hosts an absolute redirect from this plugin's routes may point at. |
| `contributions` | Markup in named UI regions. |
| `dependsOn` | Other plugin keys whose migrations must run first. |
| `onInstall` / `onEnable` / `onDisable` / `onUninstall` | Lifecycle callbacks. See [below](#the-lifecycle). |

> [!NOTE]
> Everything but the callbacks is **declarative**. A plugin does not call
> `registerHook` at import time; it exports an object and the host reads
> it. Registration by side effect would make the installed set depend on
> module evaluation order, which differs between the dev server, a bundled
> build and the worker.

## What a plugin cannot do

These are not discouraged; there is no API for them.

| It cannot | Why |
|---|---|
| Decide authorization | No hook filters `authorization.can()`, and none ever will. A plugin able to change that answer can grant itself anything. The one narrow exception, putting a member in a group the operator pre-approved for a limited time, is [timed group grants](#timed-group-grants), and its refusals are what keep it from being this row. |
| Reach inside the visibility filter | No hook sits in the query path. A plugin that could rewrite a `where` clause could publish a private forum. |
| See an `Actor` | Payloads carry `{ userId, isGuest }`. An `Actor` carries resolved group membership, which would invite a plugin to make its own permission decisions. |
| Open a database connection | A plugin never holds a connection. Its own tables are reachable through `context.data`, host-run, parameterised, under a database-side timeout, and its migrations can only create objects under its own prefix. |
| Patch core | There is no monkey-patching seam and no way to replace a domain command. |
| Fill a theme slot | A theme owns its slots. Plugins contribute to *regions*, described below. |

## Filters and events

| | What it gets | What happens to the return value |
|---|---|---|
| **Filter** | A value | It is used. Filters chain: each plugin receives what the previous one returned. |
| **Event** | A notification | Discarded. |

> [!TIP]
> Anything that only wants to *know* (logging, a webhook, a counter) should
> be an event. An event handler cannot corrupt the thing it is watching.

Both kinds can reach this plugin's runtime, so an event handler is where a
plugin reacts to the board durably: recording a row, queueing a delivery,
raising a notification.

### Reaching the runtime from a handler

A handler's first two arguments are the value and the hook's own context.
Its **third is a function that resolves this plugin's runtime**: the same
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

It is a function, not a value, for two reasons. Hooks are the hot path
(`view.*` filters run on every page and `postbit.badges` once per post) and
a handler that never calls it costs nothing. And acquiring the runtime can
fail: on a fixture-mode board there is no database, and `await runtime()`
rejects with a message that says so. Within a single handler call the
runtime is resolved once and reused.

The reach is the same one everything else in the plugin gets: `data` still
refuses anything outside `plugin_<key>_*`, `grants` still refuses a group the
operator has not opened, and a throw is contained and counted as [failure
isolation](#failure-isolation) describes. Testing a handler that uses it
needs no board. `unavailableHookRuntime()` stands in, and every capability
on it refuses with the reason you pass:

```ts
filter(footer, viewer, unavailableHookRuntime('this test drives the filter directly'))
```

### Ordering

Handlers run in **(priority, plugin key)** order. Lower priority runs first;
the default is 100, so a plugin can insert on either side of an
unopinionated one without negative numbers. Both halves are declared and
total, so two plugins compose the same way on every request and every
instance.

## Failure isolation

Every handler runs inside the host's try/catch:

| What happens | Result |
|---|---|
| A filter throws | The value is left as it was, and the chain continues with the next plugin |
| A filter returns `undefined` | Treated the same way: that is the shape of a handler that forgot to return |
| An event throws | Recorded and forgotten |

Nothing a plugin does propagates to the page. Failures are survivable, **not
invisible**: every failure is counted, logged with the plugin key and the
hook, and reported by `host.health()`.

**Auto-disable is durable.** Every failure is counted in a `plugin_health`
row, and the fifth switches the plugin off with the hook and the message
that did it. The row survives a restart, is shared by every web instance and
the worker, and each of them reconciles against it. A plugin that started
failing at 2am is off when the platform recycles the instance at 3am, and
off on the instance that never saw it fail.

Nothing re-enables it on its own. An operator clears the record with
**Clear failures and re-enable** on `/admin/plugins`, which deletes the row
and takes effect on the next request across the board.

> [!NOTE]
> The count is the *board's* count, not one instance's, so a plugin
> failing twice on each of three instances is switched off.

**Timing is measured, never enforced.** Each call is timed, and slow ones
are logged and counted. There is no timeout, because JavaScript cannot abort
a handler: a `Promise.race` that "times out" returns control while the
handler keeps running, keeps its connection, and resolves later.

**UI contributions are isolated when they are built, not while they
render.** The host calls your `render` function inside a try/catch, so a
throw there drops your contribution and the region renders without it. A
component that throws later, inside React's own render, cannot be contained
from the server. Build your markup in the function; do not return a
component that does work.

## UI regions

Regions are not theme slots. A region is an explicit "plugins may add
something here" point that a *theme* renders. The theme keeps control of
**where** plugin output appears; the plugin keeps control of **what** it is;
several plugins compose by concatenation, in the usual deterministic order.

There are eight: `header.notice`, `index.footer`, `thread.header`,
`postbit.badges`, `postbit.footer`, `threadrow.badges`, `profile.panel` and
`admin.dashboard`, described in [Plugin hooks](../reference/plugin-hooks.md).
The list is short because every region is a commitment every theme has to
render or deliberately drop. `admin.dashboard` is the exception the theme
never sees: the control panel renders it on the admin overview below the
board's statistics, each contribution wrapped in a plugin card.

**A contribution may be async, and may reach this plugin's runtime.** Its
`render` receives the same lazy `runtime` accessor a [hook
handler](#reaching-the-runtime-from-a-handler) does, and may return a
promise:

```ts
{
  region: 'thread.header',
  render: async ({ subjectId, runtime }) => {
    const { data } = await runtime()
    const row = await data.one('select title from plugin_example_event where thread_id = $1', [subjectId])
    return row === null ? null : <EventCard title={String(row.title)} />
  },
}
```

Mind **where** you do it. `thread.header` runs once per thread page, so a
query there costs one query. `postbit.badges` runs once per *post*, so a
query there is fifty queries on a fifty-post page. A contribution that
rejects is contained, counted and auto-disabled exactly like one that
throws.

`threadrow.badges` is the exception to the shape above. A forum page lists
around twenty threads on a 50ms budget, so it runs **once per page**: its
context carries `threads`, every visible row as a `{ threadId, authorId }`,
and its `render` returns a `Map` keyed by thread id, a badge for the rows it
wants to mark and nothing for the rest. A plugin answers the whole page in
one query of its own tables:

```ts
{
  region: 'threadrow.badges',
  render: async ({ threads, runtime }) => {
    const { data } = await runtime()
    const rows = await data.query(
      'select thread_id, kind from plugin_example_flag where thread_id = any($1)',
      [threads.map((thread) => thread.threadId)],
    )
    return new Map(rows.map((row) => [Number(row.thread_id), <Flag kind={String(row.kind)} />]))
  },
}
```

**A contribution's context also carries `locale` and `t`,** the reader's
resolved language tag and a translator, the same pair a page context gets.
Resolve a key through `t`, falling back to the plugin's own bundled string,
rather than rendering a fixed English literal:

```ts
{
  region: 'thread.header',
  render: ({ t, locale }) => (
    <p>{t.has('example.card.title') ? t.t('example.card.title') : en['example.card.title']}</p>
  ),
}
```

## Changing how content renders

Seven filters reach the render pipeline, and they divide on **when** they
run, which decides what a plugin can change and what it costs.

| Filter | When it runs | What it shapes |
|---|---|---|
| `markdown.parse.text` | Write | The source handed to the parser |
| `markdown.render.html` | Write | The HTML the renderer constructed |
| `markdown.directives` | Write | The `:::name` and `:name[…]` vocabulary |
| `smilies.list` | Write | The smilie set substituted at render |
| `post.body.html` | Read | One post's body, in the thread it is read in |
| `signature.html` | Read | A member's signature, wherever it appears |
| `word-filter.patterns` | Read | The render-time word filter's rules |

**Write** means the filter runs where a body becomes HTML (a new thread or
reply, an edit, a private message, a saved signature, the composer's
preview) and its output is what the board stores. Those four carry no
viewer: a stored render is shared by everybody who reads the post.

**Read** means the filter runs once per body per page view. Nothing is
stored, so a change takes effect immediately and disappears when the plugin
is removed.

**The source is never touched.** `markdown.parse.text` changes what the
parser is handed; the `message` column still holds exactly what the member
typed, which is what quoting, editing and the next re-render start from.

**Installing or removing a formatting plugin re-renders the board.** The
board records a *rendering signature*: the keys and versions of the
installed plugins that register any of the four write-time filters. When it
changes, the content revision is bumped, and `posts.render_backfill` walks
the board re-rendering every post through the new pipeline, so a formatting
plugin applies to existing posts and removing one takes its markup back
out. On a large board the sweep reports its backlog in `/admin/system`; a
row the sweep has not reached is rendered in memory when somebody reads it.

> [!WARNING]
> What `markdown.render.html`, `post.body.html` and `signature.html` return
> is **trusted output**: it is inserted as markup and nothing escapes it
> afterwards. `post.body.html` runs after the board's word filter, so a
> plugin's own additions are not filtered either.

### A directive with its own toolbar button

`markdown.directives` only names the syntax. A plugin that wants a button
for it in the composer contributes to `view.editor-toolbar` too, the same
filter the built-in bold, link and table buttons flow through:

```ts
hooks: {
  'markdown.directives': (directives) => [...directives, { name: 'alert', block: true }],
  'view.editor-toolbar': (toolbar) => ({
    ...toolbar,
    buttons: [
      ...toolbar.buttons,
      {
        tag: null,
        insertion: { kind: 'block', text: ':::alert\n\n:::' },
        label: 'Alert',
        title: 'Alert',
        keyShortcut: null,
        icon: null,
        placeholder: null,
      },
    ],
  }),
},
```

A button carries either `tag`, one of the board's own commands, or
`insertion`, never both. `EditorTag` is a closed union of the board's own
formatting commands, so a plugin's own syntax has nothing to set `tag` to;
`insertion` is a small serialisable edit a theme runs the same way it runs a
built-in one:

- `{ kind: 'wrap', before, after }` wraps the selection, or, with nothing
  selected, places the caret between `before` and `after`. For an inline
  span like `:name[…]`.
- `{ kind: 'block', text }` inserts a fixed snippet on its own lines,
  replacing whatever was selected. For a block like `:::name` above.

Both are plain data, a string to insert rather than a function to call,
which lets the button cross the RSC boundary into a client-rendered theme
slot. A theme runs it with `applyInsertion(field, insertion)`, exported from
`@meith/theme-kit` beside `applyEditorTag`. A theme that hands a button's
`tag` to `applyEditorTag` needs the same one-line addition to also try
`insertion`; the three themes that override `EditorToolbar` show it.

**No extra escaping.** `:::alert\n\n:::` is Markdown typed on the member's
behalf. Once inserted it sits in the textarea like anything typed by hand
and flows through the ordinary parser and the ordinary `markdown.directives`
render path. The directive still has to be registered for anything to
render from it.

## The lifecycle

Four callbacks, each handed the same runtime context a task gets: resolved
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
is written, so a throw leaves the board able to try again.

**`onEnable` and `onDisable` run on the operator's switch only**, not on the
host's own switch after repeated failures. They run *after* the switch is
written, so the callback sees the state it is being told about. A callback
that throws is counted and shown in the plugin's health row rather than
reported to the operator as their action having failed.

**`onUninstall` needs `meith plugin:purge`.** Removing a plugin is
`pnpm remove`, taking it out of `meith.plugins.ts` (`meith plugin:remove
<key>` for a manifest entry, by hand for the escape hatch) and a redeploy.
At the moment the board would call `onUninstall`, the function is no longer
in the build, so the operator says when:

```sh
meith plugin:purge dues          # says what it would do
meith plugin:purge dues --yes    # runs onUninstall, then drops the data
```

It runs `onUninstall` first and drops nothing if that throws, then takes away
the plugin's `plugin_<key>_*` tables, its settings, its migration records, its
navigation items, its version row and its health row. Then you remove the code.
Purging a plugin that is not in the build is refused: there would be no
`onUninstall` left to run.

The tables it drops are matched against the literal `plugin_<key>_` prefix, not a
pattern. The `_` stands for itself, so a two-letter key like `mi` takes only
`plugin_mi_*` and never the board's own `plugin_migrations`. The board's
`plugin_migrations` and `plugin_health` tables are excluded outright as well.

> [!TIP]
> Keep `onInstall` **idempotent**. It runs once per board, and a board
> restored from a backup taken before the install will run it again.

## Asking for a place in the navigation

A plugin with a member-facing page usually wants a link to it. `navigation`
is how it asks:

```ts
navigation: [
  { key: 'plans', label: 'Supporters', path: '', audience: 'members' },
  { key: 'manage', label: 'Your membership', path: 'manage', audience: 'members', under: 'plans' },
]
```

Each entry names one of the plugin's **own** `pages` by path, so a
navigation item cannot point somewhere the plugin did not build. The host
writes it into the board's navigation table under `plugin.<key>.<item>` the
first time the board's menu is built after the plugin appears, and from
that moment **the operator owns it**: they rename it, reorder it, nest it
under another item, restrict it to groups, or switch it off on
`/admin/content/navigation`. Redeploying does not undo any of that; only the
address is refreshed from the code.

- **`label` is a starting point, not a fixed string.** Give `labelKey` too
  and the board translates it, until an operator types their own label,
  which then wins in every language.
- **`audience` is the default scope** (`all`, `guests`, `members`,
  `staff`), and the operator can narrow it further to specific groups. It
  is presentation, not permission: the page re-checks whoever arrives.
- **`under` is the default nesting.** Name another of the plugin's own
  items and this one is created as its sub-menu entry. The menu is one
  level deep, so the item named must itself be top-level. Like `audience`
  it only seeds the row; the operator re-nests or flattens it afterwards.
- **The item disappears with the plugin.** Switch the plugin off and the
  link stops rendering; take the plugin out of the build and the row goes
  at the next `meith upgrade`. An operator's ordering is not lost in
  between.

Appending to `view.header` instead would put a link where no operator could
reach it.

## Namespacing

A plugin's key namespaces everything it registers, and the host builds the
names, so a plugin cannot collide with another plugin or reach a core name:

| Thing | Name it gets |
|---|---|
| Setting | `plugin.<key>.<setting>` |
| Task | `plugin.<key>.<task>` |
| Admin page | `/admin/plugins/<key>/<path>` |
| Message | `<key>.<message>`, by convention rather than by construction |

One name in that namespace belongs to the host: `plugin.<key>._enabled` is
the operator's kill switch. A plugin cannot declare it, because setting
names cannot start with an underscore.

`definePlugin` refuses a key, setting name, task id or page path that would
not namespace cleanly: a dot in a plugin key would produce an ambiguous
setting key, and a slash in a page path would escape the admin prefix.

## Words of its own

A plugin that shows text to a member ships a message catalog and is
registered with it. The entry lives in `meith.plugins.ts`, generated from
`board.plugins.json` as [Installing a plugin](#installing-a-plugin)
describes, and `meith.config.ts` spreads that list into `plugins`:

```ts
export const INSTALLED_PLUGINS: readonly InstalledPlugin[] = [
  { key: 'dues', enabled: true, plugin: dues, messages: duesMessages },
]
```

where `duesMessages` is `{ [locale]: { [key]: pattern } }`. Plugin catalogs are
merged after the board's and after any theme's, so a plugin can reword
either. Namespace your keys with your plugin key, and name a board key only
when overriding it is the point.

A page context, and a [region contribution](#ui-regions)'s context, also
carries `locale`, the language tag the board resolved for this reader, and `t`,
the translator built from that language. A plugin renders arbitrary UI, so
unlike a theme it formats its own dates and numbers:
`new Intl.NumberFormat(context.locale)` rather than `toLocaleString()`, which the
`no-fixed-locale-format` guard refuses.

A plugin that ships only `en` works; its messages fall back to English for
every reader. [Languages](../operating/internationalisation.md) covers the
message syntax, the plural categories, and how a translator adds a language.

## Timed group grants

`context.grants`, available on every runtime context, is the only write a
plugin gets against the board's own data: it can put a member in a usergroup
**until a date**. A usergroup already carries forum permissions, a badge and
a name colour, so time-limited membership of one is a complete building
block (a paid pass, a trial, a course cohort, an event's temporary access).

```ts
await context.grants.grant({ userId, groupKey: 'supporters', until, reason: 'order 42 paid' })
await context.grants.extend({ userId, groupKey: 'supporters', until })
await context.grants.revoke({ userId, groupKey: 'supporters', reason: 'refunded' })
const granted = await context.grants.list(userId)
const isSupporter = await context.grants.holds(userId, 'supporters')
```

The host refuses, on every call:

- A group the operator has not marked **"may be granted by plugins"** on its
  admin screen. The opt-in is per group and off by default.
- A **system** or **staff** group, or any group whose permission set carries
  administrative or moderation power. The admin checkbox refuses these too,
  so the refusal is heard at setup time.
- A grant with no expiry, an expiry in the past, or one more than two years
  out. Every grant lapses on its own.
- A membership **someone else** granted: an administrator's, or another
  plugin's. `grant` refuses it and `revoke` leaves it alone.
- An empty `reason`. The reason is stored on the row; it is the audit
  trail.

A grant is an additive secondary membership by default: the member's primary
and display groups are left alone. The granted group can appear as an extra
title, as far as [Maximum displayed groups](../using/groups.md#display-groups)
allows, and when the grant ends everything falls back to what it was.

**Expiry is true at the read, not enforced by a sweep.** Actor assembly
skips a lapsed row, so access ends at the boundary even if no task ever runs
again. A `groups.expire` task deletes lapsed rows afterwards and bumps the
permission version so derived caches follow. Re-granting and extending only
ever move an expiry **forward**: a stale or replayed call cannot shorten
what a member already holds.

### Reading whether a member holds a group

`list` reports only the grants **this plugin** made. `holds` answers whether
this member holds this group right now, however the membership arose: a
primary group, a plain secondary, a grant from an administrator or from
another plugin all count.

```ts
const isSupporter = await context.grants.holds(userId, 'supporters')
```

It is the **read side of the same privacy line as the write.** It reads only
groups the operator has ticked **"may be granted by plugins"**, the same
opt-in `grant` requires; every other group stays invisible. The refusals
mirror the write side:

- A group the operator has **not** opted in returns `false`, the same answer
  as a member who is not in it. A plugin cannot tell an opted-out group
  apart from one nobody holds, and cannot probe for a group's existence. A
  group key that names nothing returns `false` for the same reason.
- A **system** or **staff** group, or one whose permissions carry
  administrative or moderation power, is **refused** even if it has somehow
  been marked grantable.

`holds` reads standing the same way the board itself does: a grant that has
lapsed confers nothing from the moment it expires, before any sweep deletes
its row, and a promotion whose grant has lapsed falls back to the group
behind it. On a fixture-mode board, where there is no membership table, it
refuses with a clear error.

### Selling the group a member wears

`primary: true` on a grant asks for the group to become the member's
**primary** one, which is usually what a paid membership means to the member
buying it:

```ts
await context.grants.grant({ userId, groupKey: 'supporters', until, reason, primary: true })
```

The board does the swap, and it is reversible by construction:

- The group the member was primary in becomes an ordinary secondary
  membership with no expiry, and the granted row remembers it in
  `previous_primary_group_id`.
- A second promotion on top of a first still remembers the group behind
  *both*, never a group that is itself only held until a date, so a member
  cannot end up primary in a group they have stopped paying for.
- On `revoke`, and when `groups.expire` collects the lapsed row, the
  remembered group is made primary again and the secondary row it left
  behind is removed.
- Actor assembly does the same fallback at the read: a promoted primary
  whose grant has lapsed confers nothing, and permissions are assembled
  from the remembered group instead.

All the refusals above still apply, and one more: **a staff member's primary
group is never displaced.** Where the buyer is already primary in a staff
group, or a group carrying administrative or moderation power, the promotion
is silently skipped. The grant still lands as a secondary membership, but
their standing is left alone. Nothing is reported; a plugin has no business
branching on whether the buyer is a moderator.

`grant` takes a plain `userId`, and nothing ties it to whoever is acting.
Who may cause a grant for whom is the plugin's own policy, decided in its
own code with its own records.

On a fixture-mode board there is no membership table, and every call rejects
with a clear error.

## A database of its own

`context.data`, on every runtime context, reads and writes the tables this
plugin's migrations created. Three methods, parameterised only:

```ts
await context.data.query('insert into plugin_example_entry (user_id, note) values ($1, $2)', [userId, note])
const row = await context.data.one('select * from plugin_example_entry where user_id = $1', [userId])
await context.data.tx(async (tx) => {
  // everything in here commits together or not at all
})
```

- **Values travel as `$1`, `$2`, …** and are bound by the driver. There is
  no string-building helper.
- **Every call runs under a database-side `statement_timeout`**, short in a
  page render and longer in a task. This is the one timeout in the plugin
  API that holds, because Postgres can abort a query where JavaScript
  cannot abort a handler.
- **`tx` is a real transaction.** A throw rolls the whole body back; a
  nested `tx` joins the outer one rather than opening a second.
- **Every statement runs as this plugin's own database role**, which the
  database only lets touch `plugin_<key>_*` tables. See [below](#the-namespace-is-a-database-boundary).

### The namespace is a database boundary

`definePlugin` refuses a migration whose statements create, alter, drop or
fill anything not named `plugin_<key>_*` (hyphens in the key become
underscores), and refuses a foreign key that reaches outside that
namespace: a plugin table referencing a core one couples the plugin's
schema to the board's and breaks the moment either migrates. Copy ids into
plain columns instead; the reconcile-and-sweep pattern handles rows whose
subject has since gone.

`context.data` holds the same line at runtime, and Postgres enforces it.
Each plugin owns a dedicated database role, `plugin_<key>`, granted nothing
but `select`, `insert`, `update` and `delete` on its own `plugin_<key>_*`
tables and their sequences. The host runs every `context.data` statement
inside its transaction after `set local role plugin_<key>`, and the role
resets when the transaction ends. A statement that reads a core table,
touches another plugin's table, or attempts DDL is refused by the database
with `permission denied`, whatever shape the SQL takes, so a request value
concatenated into the statement text by mistake still cannot reach past
the plugin's own tables. The role is created and its grants brought up to
date when the plugin's migrations run, so a board's database user must be
able to create roles (the bundled Postgres runs as a superuser and already
can); a managed database whose login lacks that privilege needs the
`plugin_<key>` roles created once by an administrator.

This bounds the documented channel, not the process. Plugin code runs in
the host's process and can still open its own connection or read
`DATABASE_URL`; installing a plugin extends that trust. What the role
guarantees is the blast radius of a *bug*: anything issued through
`context.data` can only ever touch this plugin's own tables.

## Looking up a member

`context.users` resolves a member to the pair a plugin is allowed to see,
`{ userId, username }`, by name or by id:

```ts
const recipient = await context.users.byUsername(input)   // null if unknown
```

"Award this to @name" needs an id before anything can be stored. Deleted
accounts do not resolve. Nothing richer is exposed (no e-mail, no state, no
groups), for the same reason payloads carry a `ViewerRef` and not an `Actor`.

## HTTP routes

A plugin declares endpoints as data, and the host mounts them under
`/api/plugins/<key>/<path>`:

```ts
routes: [
  { path: 'hook/stripe', method: 'POST', access: 'anonymous', rawBody: true, handler },
  { path: 'checkout',    method: 'POST', access: 'member',    handler },
],
allowedRedirectHosts: ['checkout.stripe.com'],
```

A handler receives a `PluginRequest` (viewer, method, path, query, headers,
a parsed or raw body, the board's URL) plus the same runtime context as
every other surface, and answers with an envelope:
`{ kind: 'json' | 'text' | 'redirect', … }`. A route declaring
`rawBody: true` gets the exact request bytes, which is what webhook
signature verification needs.

The host owns every decision a plugin must not:

- **`access` is enforced before the handler runs.** `'member'` answers 401
  to a guest. `'staff'` answers 403 to anyone without the `modcp.access`
  permission, the same board-staff check a staff page makes, so a staff
  page's form can post to its own route. `'admin'` answers 403 to anyone
  without a live control-panel session, the same check the panel's own
  screens make, including its re-authentication window. A `'staff'` route
  mounts on the board, next to `'member'` routes. The handler never sees a
  refused request.
- **Admin routes mount under the panel, not the board.** An
  `access: 'admin'` route answers at `/admin/api/plugins/<key>/<path>` and
  is a 404 on the board mount, and the reverse. The panel's session token
  is a cookie scoped to the `/admin` path, so an admin endpoint must live
  where that cookie travels. An admin page's form posts there;
  `pluginAdminRoutePath` builds the URL.
- **A member or admin POST must come from the board's own origin.** The
  `Origin` header is checked against the request's host; a cross-site form
  post is a 403.
- **An admin POST lands in the panel's action log** as `plugin.route`, with
  the plugin key and path. Admin GETs are reads and stay out of the log.
- **`cookie` and `authorization` never reach the handler**, and the
  response envelope has no header or cookie field at all. That is what stops
  a plugin route from becoming a second authentication system.
- **Redirects are allow-listed.** A relative path always passes; an
  absolute URL must be https (plain http only to a loopback address, for a
  test double) and its host must be declared in `allowedRedirectHosts`, so
  a compromised setting cannot turn a board route into an open redirect.
- **Bodies are capped**: 64 KiB by default, `maxBodyBytes` up to 1 MiB.
- **Every response is `cache-control: no-store`.**
- **A disabled plugin's routes 404**, operator-disabled and auto-disabled
  alike.
- **Failures count.** A route runs under the same accounting as a hook:
  timed, logged against the plugin, and auto-disabling after repeated
  failures.
- **A route can declare its own rate limit**,
  `rateLimit: { limit, windowSeconds }`, enforced before the handler runs:
  a spent window answers 429 with a `retry-after` header. The count is per
  caller (signed-in user id, else the client address) and per instance, in
  process memory: abuse-pressure relief, not accounting. A board that
  scales out multiplies the budget by its instance count. Counting is
  sliding-window, weighing the previous window's usage against how much of
  the current window has elapsed, so a caller cannot double the budget by
  timing a second burst just after the window rolls over.

Route paths are exact matches: put ids in the query string, not the path.

> [!NOTE]
> **A form POST cannot 303 off the board.** The board's CSP pins
> `form-action` to `'self'`, and browsers hold a form submission's whole
> redirect chain to it, so a member-form route answering a redirect to a
> payment provider is blocked by the browser. The pattern that works: 303
> to one of your own pages with the target in the query, validate it there
> against your `allowedRedirectHosts`, and render a meta refresh plus a
> fallback link. An ordinary navigation is outside `form-action`'s remit.
> `plugins/dues` ships this as its `go` page.

## Admin pages

`adminPages` are the operator-facing half, mounted at
`/admin/plugins/<key>/<path>`. `render` gets a `PluginAdminPageContext`, the
runtime context plus the panel URL's query string, and returns markup,
which the panel frames so that the cards a page brings still read as
raised.

A plugin that declares any pages becomes a *place* in the panel:

- **A tab bar across the top of every one of its screens**, the plugin's
  own settings screen included (labelled `Settings`, the first tab). A
  plugin with one page gets no tab bar.
- **Its own section in the panel's rail**, headed with the plugin's name
  and listing its pages, whenever the operator is anywhere under
  `/admin/plugins/<key>`.
- **Links on its row of `/admin/plugins`.**

Pages appear in the order the plugin declares them, and a page on a
disabled plugin appears nowhere.

**`title` is a label, so keep it short.** It becomes the tab, the rail
entry and the page heading, and the plugin's name is already above all
three: `'Plans'`, not `'Dues: plans'`. A page may give `titleKey`, with
`titleArgs` for interpolation, and the board translates the title for the
reader, falling back to `title`.

## Board pages

`pages` are the member-facing half, mounted at `/plugins/<key>/<path>` and
rendered inside the board's shell with the page's declared title:

```ts
pages: [
  { path: '',       title: 'Membership', access: 'member',    render },
  { path: 'return', title: 'Confirming', access: 'anonymous', render },
]
```

`render` gets a `PluginPageContext`, the runtime context plus the viewer,
the path, the query and the board URL, and returns markup. The same
containment as admin pages applies: a throw is logged and the page renders a
plain failure notice in the shell, not a 500. `access: 'member'` sends a
guest to the sign-in page and back afterwards. A page on a disabled plugin
is a 404, exactly like a route. `title` may be paired with `titleKey` and
`titleArgs`, as on an admin page.

As with contributions: build your markup in the render function rather than
returning a component that does work. The host's try/catch is around the
call, not around React's render.

## Staff pages

A board page marked `access: 'staff'` is a moderation-helper screen: the
place for a plugin's triage list or its report tooling. It is still a
`pages` entry, with the same `render` and the same `PluginPageContext`,
differing only in who may see it and where it appears.

```ts
pages: [
  { path: 'triage', title: 'Triage', access: 'staff', render },
]
```

- **The host enforces it before the render runs.** A staff page answers only
  to a viewer who holds `modcp.access`, the same board-staff resolution the
  moderation panel's own screens make (`resolveModCpAccess`). Anyone else is
  a 404; the render is never called. This is the page half of the rule that
  [a plugin never decides authorization](#what-a-plugin-cannot-do): a staff
  page changes *who* may look at a screen, not *what* the plugin may do.
- **It mounts inside the moderation panel**, at
  `/modcp/plugins/<key>/<path>`, framed by the modcp `PanelShell` and rail,
  not on the board, where a `'staff'` page is a 404. A plugin with staff
  pages becomes its own section in that rail, headed by the plugin's name,
  exactly as `adminPages` do in the admin rail.
- **The context does not widen.** A staff page gets the same
  `PluginPageContext` as any other: locale, translator, and a `viewer` that
  is still a `ViewerRef`, never an `Actor`. `context.data` and
  `context.users` are unchanged.

> [!NOTE]
> **`modcp.access` is board-wide staff, and that is the whole of the gate in
> this version.** A per-forum moderator who does not also hold `modcp.access`
> will not see plugin staff pages, even in a forum they moderate. The panel
> itself draws the same line.

## Notifications

`context.notify`, on every runtime context, sends a member a notification
through the board's own system: the bell, an e-mail if the member wants one,
and a [pushed notification](../operating/operating.md#web-push) if the board
offers push and the member asked for it. A plugin first declares its kinds as
data:

```ts
notifications: [
  { key: 'gift_received', title: 'Somebody gifts you a membership',
    description: 'A member bought a membership in your name.' },
  { key: 'renewal_trouble', title: 'A membership payment fails',
    description: 'Your renewal did not go through; access holds while Stripe retries.',
    emailByDefault: false, pushByDefault: true },
],
```

and then sends against a declared kind:

```ts
await context.notify.send({
  userId: recipient,
  kind: 'gift_received',
  subject: 'alice bought you a 90-day pass',
  body: 'It starts the moment the payment confirmed.',
  href: '/plugins/dues/manage',
  dedupeKey: `order:${order.id}`,
})
```

The words may travel as message keys instead, so the board renders them in
the recipient's language: `subjectKey` with `subjectArgs`, and `bodyKey`
with `bodyArgs`, resolved through the plugin's own catalog. A send needs
exactly one of `subject` or `subjectKey`, and at most one of `body` or
`bodyKey`; anything else is refused.

```ts
await context.notify.send({
  userId: recipient,
  kind: 'gift_received',
  subjectKey: 'dues.notify.gift.subject',
  subjectArgs: { from: giver.username, days: 90 },
  bodyKey: 'dues.notify.gift.body',
  href: '/plugins/dues/manage',
})
```

The host owns the decisions a plugin must not:

- **Every kind is namespaced**, `plugin.<plugin>.<kind>`, and lands as its
  own line on the member's notification preferences screen, where the
  member decides which channels it reaches them by. `emailByDefault` and
  `pushByDefault` set the starting positions (push starts off unless a
  plugin asks otherwise) and the member's choice wins from then on.
- **An undeclared kind refuses at send.**
- **The words travel as data.** The subject (up to 200 characters) and body
  (up to 2,000) are rendered by the board on the bell and in the e-mail,
  with the same template and the same unsubscribe machinery as every core
  notification.
- **`href` stays on the board.** A notification links to a board path,
  never off-site.
- **`dedupeKey` coalesces repeats** exactly as core kinds do: raising the
  same key again bumps a counter instead of stacking rows.
- **There is no fan-out primitive.** Sending is member-to-member scale, not
  broadcast; a plugin that wants to tell everyone something has the
  announcement system's front door.

## Settings

A setting declares a `type` when its default cannot say enough: `'secret'`
and `'select'` are strings with extra rules, `'number'` and `'boolean'` are
usually inferred from the default's own JavaScript type, and `env` names an
environment variable that overrides whatever the panel stores.

```ts
settings: [
  { key: 'secret_key', label: 'API secret', type: 'secret',
    env: 'MYPLUGIN_SECRET_KEY', required: true, default: '' },
  { key: 'mode', label: 'Mode', type: 'select', default: 'off',
    options: [{ value: 'off', label: 'Off' }, { value: 'live', label: 'Live' }] },
]
```

- **Resolution is environment, then board, then default**, the same rule
  as `APP_URL` and the mail settings. When the variable is set, the panel's
  box goes inert and says which variable owns it.
- **A secret is write-only.** `definePlugin` refuses one with a shipped
  default. The panel shows *that* a value is set, never the value, and a
  blank submit keeps what is stored. A secret's value reaches the plugin's
  runtime context and nowhere else.
- **`required` reports, it does not block.** An unset required setting is a
  named problem on the plugin's screen rather than a save that refuses
  everything else.
- **A `select`'s option values are matched case-insensitively and
  trimmed**, so a stray `DUES_CURRENCY=EUR` or a trailing space from an
  environment value still finds the option `'eur'` declares. The resolved
  value is always the option's own declared casing. Declare option values
  lowercase.
- **A `select` whose stored value is no longer among its options** (an
  older version of the plugin declared more) resolves to the default.
- **A `number` has no minimum, maximum or step to declare.** An unparseable
  stored or environment value resolves as if unset, falling through to the
  next source. A plugin that needs a bounded number clamps it itself when
  reading `context.settings`; see `plugins/dues`'s grace-period setting.
- **`label`, `description` and each option's `label` may be paired with a
  message key**: `labelKey`, `descriptionKey` and `options[].labelKey`. The
  panel translates through the plugin's catalog and falls back to the
  literal.
- **`advanced: true` marks a setting as advanced** on the plugin's settings
  screen, for the knobs most operators never need to touch.
- **A setting has no `descriptionArgs`.** Unlike a plugin's own top-level
  description, a setting's `description`/`descriptionKey` is translated with
  no interpolation. A bound worth stating (a grace period's allowed range, a
  number's units) belongs in the catalog text itself.

## Migrations

Forward-only, like core's: a down migration that drops a column is a
data-loss button on a live board.

Ids look like `0001_add_table` and are applied in sort order.

> [!IMPORTANT]
> `definePlugin` refuses a migration list that is not written in ascending
> order, because the failure would otherwise be silent: a fresh board
> applies everything, an upgraded board skips the id that sorts before the
> last one applied, and the two boards end up with different schemas and no
> error anywhere.

## Scheduled tasks

A task declares **exactly one** of two cadences, and `definePlugin` refuses
one that sets neither or both:

```ts
tasks: [
  { id: 'sweep', intervalSeconds: 900, run: async (ctx) => { /* … */ } },
  { id: 'digest', schedule: '0 9 * * 1', run: async (ctx) => { /* … */ } },
]
```

- **`intervalSeconds`** is a fixed cadence measured from the end of the last
  run, with a 60-second floor: the tick is minute-granular at best.
- **`schedule`** is a five-field cron expression, `minute hour
  day-of-month month day-of-week`, **evaluated in UTC**. There is no board
  timezone to evaluate it against (see [the default timezone is the
  reader's](../getting-started/mybb-parity.md)), and UTC is stated in the
  type and in the error `definePlugin` throws.

The expression is validated at `definePlugin` time, not at first tick: both
that it parses and that it can ever occur, so a well-formed impossibility
like `0 0 30 2 *` (February 30th) is refused. A board with a bad schedule
fails to start rather than logging a stuck task weeks later. Fields are
numeric (no `MON` or `JAN` names); `*`, ranges (`1-5`), lists (`0,30`) and
steps (`*/15`) are understood; `0` and `7` both mean Sunday; and when both
day-of-month and day-of-week are restricted a day matching **either** one
runs, the standard cron rule.

- **The 60-second floor holds for cron too.** The finest a five-field
  expression can ask for is `* * * * *`, once a minute. A sixth (seconds)
  field is refused.
- **A scheduled task's first run is its next matching time _after_ it is
  registered.** It does not fire on install: a `0 9 * * 1` task added on a
  Wednesday first runs the coming Monday at 09:00 UTC.
- **A missed window fires once, not once per occurrence.** If the worker is
  down across one scheduled moment, or several, the task runs a single time
  on the next tick and is then scheduled forward. There is no backfill; a
  weekly digest that slept through two Mondays sends one digest, not two.

> [!IMPORTANT]
> **Task idempotency is unchanged, and a cron schedule does not relax it.**
> The scheduler can still run a task more than once: two workers racing a
> claim, a retried tick, a missed window collapsing to a single catch-up
> run. A task must be safe to double-fire and resumable from a partial run.
> Make the work idempotent (upsert, mark-then-act, a claimed cursor); the
> schedule decides _when_ a run may start, never that a run happens exactly
> once.

The admin panel and the scheduler's health view describe a scheduled task by
a cadence derived from the gap between its upcoming runs, so a weekly task
reads as weekly rather than as a task that has not run in seven days.

> Core's own tasks are interval-only today. Giving them cron schedules is a
> possible follow-up.

## Versioning

`definePlugin` requires semver. The version is the plugin's own: it is what
the admin panel shows and what its migration history is recorded against.

`apiVersion` declares which plugin-kit major the plugin was written
against. The same policy as the [theme API](./themes.md#versioning)
applies: a minor adds hooks, payload fields and regions; a major may remove
or rename one, and only after a deprecation cycle.

## What is wired, and what is not

The inventory is derived, not remembered: `scripts/hook-callsites.mjs`
scans the tree, and the generated reference's wired column comes from that
scan. Every hook in the registry has a call site in the board, and
[Plugin hooks](../reference/plugin-hooks.md) carries the count. If that
column ever reads otherwise, believe the column.

A hook that is declared but not wired would not be broken, only unfinished:
registering a handler for one is legal and does nothing.

**`plugins/reference` must handle every wired hook**, enforced by its own
test, so a hook cannot join the running product without something proving
it fires. The same plugin declares a route of every shape, a board page, a
secret setting with an environment override and a select, and its tests
drive each one.

### The descriptors execute

Everything declared runs today, the four lifecycle callbacks included; see
[the lifecycle](#the-lifecycle). Migrations are applied by `meith upgrade`
in dependency order, one transaction each. Settings are stored at
`plugin.<key>.<name>` and edited in the control panel, with environment
overrides resolved as described above. Tasks are registered as
`plugin.<key>.<id>` and run on the same tick as everything else. Admin
pages mount at `/admin/plugins/<key>/<path>`, routes at
`/api/plugins/<key>/<path>` (admin routes at
`/admin/api/plugins/<key>/<path>`), board pages at `/plugins/<key>/<path>`.
The runtime capabilities `grants`, `data`, `users` and `notify` are live on
every context; on a fixture-mode board they reject with a clear error.

- **A page cannot reach anything a task cannot.** Both are handed the
  runtime context, resolved settings and a logger, and neither gets the
  `Actor`, the request, or a database handle. An admin page additionally
  sees the panel URL's query string, which is what a post-redirect-get
  notice needs. There is no per-page permission to declare; the acting half
  lives on routes, where `access: 'admin'` is checked and logged by the
  host.
- **A task's failure is not swallowed.** A task has no page to take down,
  and the scheduler already records failures and notifies administrators.
- **There is no plugin-run button for migrations.** A schema change belongs
  to the deploy that shipped the code expecting it. The panel reports which
  migrations have and have not been applied.
- **Disabling is durable and immediate; uninstalling is a command, not a
  button.** Both switches, the panel's and the host's own after repeated
  failures, write a row that every instance reconciles against on its next
  request, so both survive a redeploy. Removing a plugin is `pnpm remove`,
  a line out of `meith.plugins.ts`, and a redeploy, with
  `meith plugin:purge` before it when its data should go too.

## The generated reference is a gate

[Plugin hooks](../reference/plugin-hooks.md) is written by
`scripts/plugin-hook-docs.mjs` from the registry. `pnpm verify` and CI run
`pnpm plugin:docs:check`, which fails when the file and the code disagree.
If the check fails, run `pnpm plugin:docs` and commit the result.
