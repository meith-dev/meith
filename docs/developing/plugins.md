# The plugin API

`@meith/plugin-kit` is the contract between the board and a plugin.

This document is the policy: what a plugin is, what it may and may not do, and
what the guarantees cover. The reference, every hook and every payload, is
generated into [Plugin hooks](../reference/plugin-hooks.md). To **install** an
existing plugin, see [Installing plugins and
themes](../getting-started/installing.md).

## Writing a plugin

A plugin is a module that calls `definePlugin`. `meith.plugins.ts` is the
installed list, kept beside `meith.config.ts` so the operator CLI can read it
without importing the themes' component trees. It is **generated** from
`board.plugins.json`, the installation path for any plugin that fits it:

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

**Fitting the manifest** means the package's entry point exports the finished
plugin under two fixed names, built with no arguments. Its own configuration
comes from [settings](#settings) rather than a constructor:

```ts
// index.ts of @meith/plugin-greeter
export { greeter as plugin } from './definition'
export { greeterMessages as messages } from './messages'
```

A plugin ships TypeScript source, like every `@meith/*` package. The board
build compiles every dependency named in the board's own `package.json` through
Next's `transpilePackages`, so there is no build step to ship.
`scripts/extension-workspace-smoke.mts` proves this path against a scaffolded
plugin.

### Installing a plugin

Installing one into a board you run is `meith plugin:add <package>`, then a
commit and a redeploy.

`plugin:add` records the package in `board.plugins.json` and regenerates
`meith.plugins.ts`. **This repository** carries two boards: `apps/community`,
the in-repo dev target, and `boards/stock`, which `docker/Dockerfile` builds
the official image from (`docs/reference/architecture.md`, "The board-config
seam"). Their `board.plugins.json` files must stay identical, so the package
has to be a dependency of both, and `plugin:add` writes both manifests:

```sh
pnpm add @meith/plugin-greeter --filter @meith/web
pnpm add @meith/plugin-greeter --filter @meith/board-stock
meith plugin:add @meith/plugin-greeter
```

`plugin:add` infers the manifest key from a `@scope/plugin-<key>` package name.
Pass `--key` when the name does not fit that shape, or `--disabled` to install
it switched off. It writes the manifest:

```json
{ "plugins": [{ "key": "greeter", "package": "@meith/plugin-greeter", "enabled": true }] }
```

then regenerates `meith.plugins.ts` from it. A board's CLI writes the file
directly; this repository runs `pnpm board:gen` across both boards.
`meith plugin:remove <key>` is the reverse. If regenerating refuses a manifest,
the `board.plugins.json` edit is rolled back in every board. Neither command
takes plugin configuration: the manifest has no field for it, and `plugin:add`
refuses an attempt to pass any. A plugin that needs arguments is not
manifest-installable until its configuration moves into its own settings.

**The escape hatch is real code.** A plugin that cannot yet fit the manifest is
registered by hand: add its import and `INSTALLED_PLUGINS` entry to
`meith.plugins.ts` directly, and keep it out of `board.plugins.json` so a later
`plugin:add` does not regenerate the file and drop it. In **this repository** a
hand-written entry goes in `meith.demo.plugins.ts` instead, spread into the
generated list through `showcasePlugins()`.

`pnpm board:gen:check`, part of `pnpm verify`, fails when either board's
manifest and its `meith.plugins.ts` disagree: run `pnpm board:gen` and commit
the result. `tests/boards-stock.test.ts` fails when the two manifests disagree
with each other. Each `board.plugins.json` refuses: a duplicate key; a key
`definePlugin` would refuse; a key whose camelCase identifier collides with
another entry's, or is not itself a valid identifier (`foo--bar`, `foo-`); a
non-boolean `enabled`; a `package` that is not a valid npm package name; and a
package its own board does not depend on, naming the `pnpm add` fix.
`apps/cli/src/board-eject.ts` renders the same shape of `meith.plugins.ts` for
an ejected board with its own copy of every check but the dependency one.

> [!TIP]
> **[`examples/hello-plugin`](https://github.com/meith-dev/meith/tree/main/examples/hello-plugin)
> is the worked example to copy**: a footer-link filter, a region
> contribution, a setting, a migration, a task and an admin page. It ships
> as reference code, not installed;
> [`examples/README.md`](https://github.com/meith-dev/meith/tree/main/examples)
> walks through registering it. `npx create-meith --plugin my-plugin`
> scaffolds a standalone workspace whose source and passing test are
> generated from that example (`pnpm extension:gen`), plus a README and a
> pre-filled marketplace `listing.json`.

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

Everything but the callbacks is **declarative**. A plugin does not call
`registerHook` at import time; it exports an object and the host reads it, so
the installed set never depends on module evaluation order.

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

Anything that only wants to *know*, such as logging or a webhook, should be an
event. Both kinds can reach this plugin's runtime.

### Reaching the runtime from a handler

A handler's first two arguments are the value and the hook's own context. Its
**third is a function that resolves this plugin's runtime**: the same
`settings`, `logger`, `data`, `grants`, `users` and `notify` a task or a route
is handed:

```ts
'post.created': async (post, context, runtime) => {
  const { data } = await runtime()
  await data.query(
    'insert into plugin_example_outbox (post_id, queued_at) values ($1, now())',
    [post.postId],
  )
},
```

It is a function so that a handler that never calls it costs nothing, and
because acquiring the runtime can fail: on a fixture-mode board
`await runtime()` rejects with a message that says so. Within one handler call
the runtime is resolved once and reused. A throw is contained and counted as
[failure isolation](#failure-isolation) describes. To test a handler without a
board, `unavailableHookRuntime()` stands in, and every capability on it refuses
with the reason you pass:

```ts
filter(footer, viewer, unavailableHookRuntime('this test drives the filter directly'))
```

### Ordering

Handlers run in **(priority, plugin key)** order. Lower priority runs first.
The default is 100, so a plugin can insert on either side of an unopinionated
one without negative numbers. The order is total.

## Failure isolation

Every handler runs inside the host's try/catch:

| What happens | Result |
|---|---|
| A filter throws | The value is left as it was, and the chain continues with the next plugin |
| A filter returns `undefined` | Treated the same way: that is the shape of a handler that forgot to return |
| An event throws | Recorded and forgotten |

Nothing a plugin does propagates to the page. Every failure is counted, logged
with the plugin key and the hook, and reported by `host.health()`.

**Auto-disable is durable.** Failures are counted in a `plugin_health` row, and
the fifth switches the plugin off with the hook and the message that did it.
The row is shared by every web instance and the worker, so the count is the
board's, not one instance's. Nothing re-enables it on its own: an operator
clears the record with **Clear failures and re-enable** on `/admin/plugins`,
which takes effect on the next request across the board.

**Timing is measured, never enforced.** Slow calls are logged and counted.
There is no timeout, because JavaScript cannot abort a handler.

**UI contributions are isolated when they are built, not while they render.**
The host calls your `render` function inside a try/catch, so a throw there
drops your contribution and the region renders without it. A component that
throws later, inside React's own render, cannot be contained. Build your markup
in the function; do not return a component that does work.

## UI regions

Regions are not theme slots. A region is an explicit "plugins may add something
here" point that a *theme* renders: the theme decides **where**, the plugin
decides **what**, and several plugins compose by concatenation in the usual
deterministic order.

There are eight: `header.notice`, `index.footer`, `thread.header`,
`postbit.badges`, `postbit.footer`, `threadrow.badges`, `profile.panel` and
`admin.dashboard`, described in [Plugin hooks](../reference/plugin-hooks.md).
`admin.dashboard` is the one the theme never sees: the control panel renders it
on the admin overview below the board's statistics, each contribution wrapped
in a plugin card.

**A contribution may be async, and may reach this plugin's runtime.** Its
`render` receives the same lazy `runtime` accessor a [hook
handler](#reaching-the-runtime-from-a-handler) does, and may return a promise:

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

Mind **where** you do it: `postbit.badges` runs once per *post*, so a query
there is fifty queries on a fifty-post page. A contribution that rejects is
contained, counted and auto-disabled exactly like one that throws.

`threadrow.badges` is the exception. A forum page lists around twenty threads
on a 50ms budget, so it runs **once per page**: its context carries `threads`,
every visible row as a `{ threadId, authorId }`, and its `render` returns a
`Map` keyed by thread id, a badge for the rows it wants to mark and nothing for
the rest. A plugin answers the whole page in one query:

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
language tag and a translator. Resolve a key through `t`, falling back to the
plugin's own bundled string, rather than a fixed English literal:

```ts
{
  region: 'thread.header',
  render: ({ t, locale }) => (
    <p>{t.has('example.card.title') ? t.t('example.card.title') : en['example.card.title']}</p>
  ),
}
```

## Changing how content renders

Seven filters reach the render pipeline. They divide on **when** they run.

| Filter | When it runs | What it shapes |
|---|---|---|
| `markdown.parse.text` | Write | The source handed to the parser |
| `markdown.render.html` | Write | The HTML the renderer constructed |
| `markdown.directives` | Write | The `:::name` and `:name[…]` vocabulary |
| `smilies.list` | Write | The smilie set substituted at render |
| `post.body.html` | Read | One post's body, in the thread it is read in |
| `signature.html` | Read | A member's signature, wherever it appears |
| `word-filter.patterns` | Read | The render-time word filter's rules |

**Write** means the filter runs where a body becomes HTML: a new thread or
reply, an edit, a private message, a saved signature, the composer's preview.
Its output is what the board stores, and it carries no viewer: a stored render
is shared by everybody who reads the post. **Read** means the filter runs once
per body per page view, so a change takes effect immediately and disappears
when the plugin is removed.

**The source is never touched.** `markdown.parse.text` changes what the parser
is handed; the `message` column still holds exactly what the member typed,
which quoting, editing and the next re-render start from.

**Installing or removing a formatting plugin re-renders the board.** The board
records a *rendering signature*: the keys and versions of the installed plugins
that register any of the four write-time filters. When it changes, the content
revision is bumped, and `posts.render_backfill` re-renders every post through
the new pipeline. The sweep reports its backlog in `/admin/system`; a row it
has not reached is rendered in memory when somebody reads it.

> [!WARNING]
> What `markdown.render.html`, `post.body.html` and `signature.html` return
> is **trusted output**: it is inserted as markup and nothing escapes it
> afterwards. `post.body.html` runs after the board's word filter, so a
> plugin's own additions are not filtered either.

### A directive with its own toolbar button

`markdown.directives` only names the syntax. A plugin that wants a composer
button for it contributes to `view.editor-toolbar` too:

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

A button carries either `tag`, one of the board's own commands, or `insertion`,
never both. `EditorTag` is a closed union of the board's own formatting
commands, so a plugin's own syntax uses `insertion`, a small serialisable edit
a theme runs the same way it runs a built-in one:

- `{ kind: 'wrap', before, after }` wraps the selection, or, with nothing
  selected, places the caret between `before` and `after`: for an inline span
  like `:name[…]`.
- `{ kind: 'block', text }` inserts a fixed snippet on its own lines, replacing
  the selection: for a block like `:::name`.

Both are plain data, which lets the button cross the RSC boundary into a
client-rendered theme slot. A theme runs it with
`applyInsertion(field, insertion)`, exported from `@meith/theme-kit` beside
`applyEditorTag`; a theme that overrides `EditorToolbar` must try `insertion`
as well as `tag`. The inserted text is Markdown typed on the member's behalf,
with no extra escaping, and the directive still has to be registered for
anything to render from it.

## The lifecycle

Four callbacks, each handed the same runtime context a task gets.

| Callback | When | If it throws |
|---|---|---|
| `onInstall` | The first `meith upgrade` on a board that has never recorded this plugin, after its migrations | The upgrade stops |
| `onEnable` | An operator switches the plugin on in the panel | The switch stands; counted as a plugin failure |
| `onDisable` | An operator switches it off | The switch stands; counted as a plugin failure |
| `onUninstall` | `meith plugin:purge <key>`, before anything is dropped | Nothing is dropped |

None of them runs inside the host's try/catch.

**`onInstall` runs once per board, not once per deploy.** The board records a
`plugin:<key>` version row; no row means it has never seen the plugin. It runs
after that plugin's migrations, so its tables exist, and before the version row
is written, so a throw leaves the board able to try again. Keep it
**idempotent**: a board restored from a backup taken before the install will
run it again.

**`onEnable` and `onDisable` run on the operator's switch only**, not on the
host's own switch after repeated failures, and *after* the switch is written. A
throw is counted and shown in the plugin's health row.

**`onUninstall` needs `meith plugin:purge`.** Removing a plugin is
`pnpm remove`, `meith plugin:remove <key>` (by hand for the escape hatch) and a
redeploy. By then the function is no longer in the build, so the operator says
when:

```sh
meith plugin:purge dues          # says what it would do
meith plugin:purge dues --yes    # runs onUninstall, then drops the data
```

It runs `onUninstall` first and drops nothing if that throws, then takes away
the plugin's `plugin_<key>_*` tables, its settings, its migration records, its
navigation items, its version row and its health row. Then you remove the code.
Purging a plugin that is not in the build is refused. Tables are matched
against the literal `plugin_<key>_` prefix, so a key like `mi` takes only
`plugin_mi_*`; the board's `plugin_migrations` and `plugin_health` are excluded
outright as well.

## Asking for a place in the navigation

`navigation` asks for a link to one of the plugin's pages:

```ts
navigation: [
  { key: 'plans', label: 'Supporters', path: '', audience: 'members' },
  { key: 'manage', label: 'Your membership', path: 'manage', audience: 'members', under: 'plans' },
]
```

Each entry names one of the plugin's **own** `pages` by path. The host writes
it into the board's navigation table under `plugin.<key>.<item>` the first time
the board's menu is built after the plugin appears, and from that moment **the
operator owns it**: they rename, reorder, nest, restrict to groups, or switch
it off on `/admin/content/navigation`. Redeploying only refreshes the address
from the code.

- **`label` is a starting point.** Give `labelKey` too and the board translates
  it, until an operator types their own label, which then wins in every
  language.
- **`audience` is the default scope** (`all`, `guests`, `members`, `staff`),
  and the operator can narrow it to specific groups. It is presentation, not
  permission: the page re-checks whoever arrives.
- **`under` is the default nesting.** Name another of the plugin's own items
  and this one is created as its sub-menu entry. The menu is one level deep, so
  the item named must itself be top-level. It only seeds the row; the operator
  re-nests or flattens it afterwards.
- **The item disappears with the plugin.** Switch the plugin off and the link
  stops rendering; take the plugin out of the build and the row goes at the
  next `meith upgrade`. An operator's ordering is kept in between.

## Namespacing

A plugin's key namespaces everything it registers, and the host builds the
names:

| Thing | Name it gets |
|---|---|
| Setting | `plugin.<key>.<setting>` |
| Task | `plugin.<key>.<task>` |
| Admin page | `/admin/plugins/<key>/<path>` |
| Message | `<key>.<message>`, by convention rather than by construction |

One name in that namespace belongs to the host: `plugin.<key>._enabled` is the
operator's kill switch. A plugin cannot declare it, because setting names
cannot start with an underscore. `definePlugin` refuses a key, setting name,
task id or page path that would not namespace cleanly, such as a dot in a
plugin key or a slash in a page path.

## Words of its own

A plugin that shows text to a member ships a message catalog and is registered
with it in `meith.plugins.ts`, which `meith.config.ts` spreads into `plugins`:

```ts
export const INSTALLED_PLUGINS: readonly InstalledPlugin[] = [
  { key: 'dues', enabled: true, plugin: dues, messages: duesMessages },
]
```

where `duesMessages` is `{ [locale]: { [key]: pattern } }`. Plugin catalogs are
merged after the board's and after any theme's, so a plugin can reword either.
Namespace your keys with your plugin key, and name a board key only when
overriding it is the point.

A page context carries the same `locale` and `t` as a [region
contribution](#ui-regions). A plugin formats its own dates and numbers:
`new Intl.NumberFormat(context.locale)` rather than `toLocaleString()`, which
the `no-fixed-locale-format` guard refuses.

A plugin that ships only `en` works; its messages fall back to English.
[Languages](../operating/internationalisation.md) covers the message syntax,
the plural categories, and how a translator adds a language.

## Timed group grants

`context.grants`, on every runtime context, is the only write a plugin gets
against the board's own data: it can put a member in a usergroup **until a
date**, which covers a paid pass, a trial, a cohort or an event.

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
  administrative or moderation power. The admin checkbox refuses these too.
- A grant with no expiry, an expiry in the past, or one more than two years
  out.
- A membership **someone else** granted: an administrator's, or another
  plugin's. `grant` refuses it and `revoke` leaves it alone.
- An empty `reason`. The reason is stored on the row as the audit trail.

A grant is an additive secondary membership by default: the member's primary
and display groups are left alone. The granted group can appear as an extra
title, as far as [Maximum displayed groups](../using/groups.md#display-groups)
allows, and when the grant ends everything falls back to what it was.

**Expiry is true at the read, not enforced by a sweep.** Actor assembly skips a
lapsed row, so access ends at the boundary even if no task ever runs again. A
`groups.expire` task deletes lapsed rows afterwards and bumps the permission
version. Re-granting and extending only ever move an expiry **forward**.

`grant` takes a plain `userId`. Who may cause a grant for whom is the plugin's
own policy. On a fixture-mode board there is no membership table, and every
call rejects with a clear error.

### Reading whether a member holds a group

`list` reports only the grants **this plugin** made. `holds` answers whether
this member holds this group right now, however the membership arose. It reads
only groups the operator has ticked **"may be granted by plugins"**:

- A group the operator has **not** opted in returns `false`, the same answer as
  a member who is not in it, so a plugin cannot probe for a group's existence.
  A group key that names nothing returns `false` too.
- A **system** or **staff** group, or one whose permissions carry
  administrative or moderation power, is **refused** even if it has somehow
  been marked grantable.
- A lapsed grant confers nothing from the moment it expires, and a promotion
  whose grant has lapsed falls back to the group behind it.

### Selling the group a member wears

`primary: true` on a grant asks for the group to become the member's
**primary** one:

```ts
await context.grants.grant({ userId, groupKey: 'supporters', until, reason, primary: true })
```

The board does the swap, and it is reversible:

- The group the member was primary in becomes an ordinary secondary membership
  with no expiry, and the granted row remembers it in
  `previous_primary_group_id`.
- A second promotion on top of a first still remembers the group behind *both*,
  never a group that is itself only held until a date.
- On `revoke`, and when `groups.expire` collects the lapsed row, the remembered
  group is made primary again and the secondary row it left behind is removed.
- Actor assembly does the same fallback at the read: a promoted primary whose
  grant has lapsed confers nothing, and permissions come from the remembered
  group instead.

All the refusals above still apply, and one more: **a staff member's primary
group is never displaced.** Where the buyer is already primary in a staff
group, or a group carrying administrative or moderation power, the promotion is
silently skipped and the grant lands as a secondary membership. Nothing is
reported.

## A database of its own

`context.data`, on every runtime context, reads and writes the tables this
plugin's migrations created:

```ts
await context.data.query('insert into plugin_example_entry (user_id, note) values ($1, $2)', [userId, note])
const row = await context.data.one('select * from plugin_example_entry where user_id = $1', [userId])
await context.data.tx(async (tx) => {
  // everything in here commits together or not at all
})
```

- **Values travel as `$1`, `$2`, …** and are bound by the driver. There is no
  string-building helper.
- **Every call runs under a database-side `statement_timeout`**, short in a
  page render and longer in a task. This is the one timeout in the plugin API
  that holds.
- **`tx` is a real transaction.** A throw rolls the whole body back; a nested
  `tx` joins the outer one.
- **Every statement runs as this plugin's own database role**, which the
  database only lets touch `plugin_<key>_*` tables. See
  [below](#the-namespace-is-a-database-boundary).

### The namespace is a database boundary

`definePlugin` refuses a migration whose statements create, alter, drop or fill
anything not named `plugin_<key>_*` (hyphens in the key become underscores),
and refuses a foreign key that reaches outside that namespace. Copy ids into
plain columns instead, and reconcile and sweep rows whose subject has since
gone.

Postgres enforces the same line at runtime. Each plugin owns a dedicated
database role, `plugin_<key>`, granted nothing but `select`, `insert`, `update`
and `delete` on its own `plugin_<key>_*` tables and their sequences. The host
runs every `context.data` statement inside its transaction after
`set local role plugin_<key>`, and the role resets when the transaction ends. A
statement that reads a core table, touches another plugin's table, or attempts
DDL is refused by the database with `permission denied`, whatever shape the SQL
takes. The role is created when the plugin's migrations run, so a board's
database user must be able to create roles. The bundled Postgres runs as a
superuser; a managed database whose login lacks that privilege needs the
`plugin_<key>` roles created once by an administrator.

This bounds the documented channel, not the process. Plugin code runs in the
host's process and can still open its own connection or read `DATABASE_URL`;
installing a plugin extends that trust. The role bounds the blast radius of a
*bug*.

## Looking up a member

`context.users` resolves a member to `{ userId, username }`, by name or by id:

```ts
const recipient = await context.users.byUsername(input)   // null if unknown
```

Deleted accounts do not resolve. Nothing richer is exposed: no e-mail, no
state, no groups.

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

A handler receives a `PluginRequest` (viewer, method, path, query, headers, a
parsed or raw body, the board's URL) plus the same runtime context as every
other surface, and answers with an envelope:
`{ kind: 'json' | 'text' | 'redirect', … }`. A route declaring `rawBody: true`
gets the exact request bytes, for webhook signature verification. Route paths
are exact matches: put ids in the query string.

The host owns every decision a plugin must not:

- **`access` is enforced before the handler runs.** `'member'` answers 401 to a
  guest. `'staff'` answers 403 to anyone without the `modcp.access` permission,
  the same check a staff page makes, and mounts on the board next to `'member'`
  routes. `'admin'` answers 403 to anyone without a live control-panel session,
  including its re-authentication window. The handler never sees a refused
  request.
- **Admin routes mount under the panel, not the board.** An `access: 'admin'`
  route answers at `/admin/api/plugins/<key>/<path>` and is a 404 on the board
  mount, and the reverse, because the panel's session cookie is scoped to the
  `/admin` path. An admin page's form posts there; `pluginAdminRoutePath`
  builds the URL.
- **A member or admin POST must come from the board's own origin.** The
  `Origin` header is checked against the request's host; a cross-site form post
  is a 403.
- **An admin POST lands in the panel's action log** as `plugin.route`, with the
  plugin key and path. Admin GETs stay out of the log.
- **`cookie` and `authorization` never reach the handler**, and the response
  envelope has no header or cookie field, so a plugin route cannot become a
  second authentication system.
- **Redirects are allow-listed.** A relative path always passes; an absolute
  URL must be https (plain http only to a loopback address, for a test double)
  and its host must be declared in `allowedRedirectHosts`.
- **Bodies are capped**: 64 KiB by default, `maxBodyBytes` up to 1 MiB.
- **Every response is `cache-control: no-store`.**
- **A disabled plugin's routes 404**, operator-disabled and auto-disabled
  alike.
- **Failures count.** A route runs under the same accounting as a hook: timed,
  logged against the plugin, and auto-disabling after repeated failures.
- **A route can declare its own rate limit**,
  `rateLimit: { limit, windowSeconds }`, enforced before the handler runs: a
  spent window answers 429 with a `retry-after` header. The count is per caller
  (signed-in user id, else the client address) and per instance, in process
  memory, so a board that scales out multiplies the budget by its instance
  count. Counting is sliding-window, weighing the previous window's usage
  against how much of the current window has elapsed.

> [!NOTE]
> **A form POST cannot 303 off the board.** The board's CSP pins
> `form-action` to `'self'`, and browsers hold a form submission's whole
> redirect chain to it, so a member-form route redirecting to a payment
> provider is blocked by the browser. The pattern that works: 303 to one of
> your own pages with the target in the query, validate it there against
> your `allowedRedirectHosts`, and render a meta refresh plus a fallback
> link. `plugins/dues` ships this as its `go` page.

## Admin pages

`adminPages` are the operator-facing half, mounted at
`/admin/plugins/<key>/<path>`. `render` gets a `PluginAdminPageContext`, the
runtime context plus the panel URL's query string, and returns markup.

A plugin that declares any pages becomes a *place* in the panel: a tab bar
across the top of every one of its screens, the settings screen included
(labelled `Settings`, the first tab; a plugin with one page gets no tab bar);
its own section in the panel's rail, headed with the plugin's name, whenever
the operator is anywhere under `/admin/plugins/<key>`; and links on its row of
`/admin/plugins`. Pages appear in the order the plugin declares them, and a
page on a disabled plugin appears nowhere.

**`title` is a label, so keep it short.** It becomes the tab, the rail entry
and the page heading, under the plugin's name: `'Plans'`, not `'Dues: plans'`.
A page may give `titleKey`, with `titleArgs` for interpolation, and the board
translates the title, falling back to `title`.

## Board pages

`pages` are the member-facing half, mounted at `/plugins/<key>/<path>` and
rendered inside the board's shell:

```ts
pages: [
  { path: '',       title: 'Membership', access: 'member',    render },
  { path: 'return', title: 'Confirming', access: 'anonymous', render },
]
```

`render` gets a `PluginPageContext`, the runtime context plus the viewer, the
path, the query and the board URL, and returns markup. A throw is logged and
the page renders a plain failure notice in the shell, not a 500; as with
contributions, the host's try/catch is around the call, not around React's
render. `access: 'member'` sends a guest to the sign-in page and back
afterwards. A page on a disabled plugin is a 404. `title` may be paired with
`titleKey` and `titleArgs`, as on an admin page.

## Staff pages

A board page marked `access: 'staff'` is a moderation-helper screen. It is
still a `pages` entry, differing only in who may see it and where it appears.

```ts
pages: [
  { path: 'triage', title: 'Triage', access: 'staff', render },
]
```

- **The host enforces it before the render runs.** A staff page answers only to
  a viewer who holds `modcp.access`, the same resolution the moderation panel's
  own screens make (`resolveModCpAccess`). Anyone else is a 404; the render is
  never called. A staff page changes *who* may look at a screen, not *what* the
  plugin may do.
- **It mounts inside the moderation panel**, at `/modcp/plugins/<key>/<path>`,
  framed by the modcp `PanelShell` and rail, not on the board, where a
  `'staff'` page is a 404. A plugin with staff pages becomes its own section in
  that rail.
- **The context does not widen.** A staff page gets the same
  `PluginPageContext` as any other, with a `viewer` that is still a
  `ViewerRef`, never an `Actor`.
- **`modcp.access` is board-wide staff, and that is the whole of the gate.** A
  per-forum moderator who does not also hold `modcp.access` will not see plugin
  staff pages, even in a forum they moderate.

## Notifications

`context.notify`, on every runtime context, sends a member a notification
through the bell, e-mail, and [push](../operating/operating.md#web-push) where
the board offers it and the member asked for it. A plugin first declares its
kinds:

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

The words may travel as message keys instead, `subjectKey` with `subjectArgs`
and `bodyKey` with `bodyArgs`, resolved through the plugin's own catalog in the
recipient's language. A send needs exactly one of `subject` or `subjectKey`,
and at most one of `body` or `bodyKey`; anything else is refused.

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

- **Every kind is namespaced**, `plugin.<plugin>.<kind>`, and lands as its own
  line on the member's notification preferences screen, where the member
  decides which channels it reaches them by. `emailByDefault` and
  `pushByDefault` set the starting positions (push starts off unless a plugin
  asks otherwise) and the member's choice wins from then on.
- **An undeclared kind refuses at send.**
- **The words travel as data.** The subject (up to 200 characters) and body (up
  to 2,000) are rendered by the board with the same template and unsubscribe
  machinery as every core notification.
- **`href` stays on the board.** A notification links to a board path, never
  off-site.
- **`dedupeKey` coalesces repeats** as core kinds do: raising the same key
  again bumps a counter instead of stacking rows.
- **There is no fan-out primitive.** A plugin that wants to tell everyone
  something uses the announcement system.

## Settings

A setting declares a `type` when its default cannot say enough: `'secret'` and
`'select'` are strings with extra rules, `'number'` and `'boolean'` are
inferred from the default, and `env` names an environment variable that
overrides whatever the panel stores.

```ts
settings: [
  { key: 'secret_key', label: 'API secret', type: 'secret',
    env: 'MYPLUGIN_SECRET_KEY', required: true, default: '' },
  { key: 'mode', label: 'Mode', type: 'select', default: 'off',
    options: [{ value: 'off', label: 'Off' }, { value: 'live', label: 'Live' }] },
]
```

- **Resolution is environment, then board, then default.** When the variable is
  set, the panel's box goes inert and says which variable owns it.
- **A secret is write-only.** `definePlugin` refuses one with a shipped
  default. The panel shows *that* a value is set, never the value, and a blank
  submit keeps what is stored. A secret's value reaches the plugin's runtime
  context and nowhere else.
- **`required` reports, it does not block.** An unset required setting is a
  named problem on the plugin's screen, not a refused save.
- **A `select`'s option values are matched case-insensitively and trimmed**, so
  `DUES_CURRENCY=EUR` still finds the option `'eur'` declares. The resolved
  value is always the option's own declared casing. Declare option values
  lowercase.
- **A `select` whose stored value is no longer among its options** resolves to
  the default.
- **A `number` has no minimum, maximum or step to declare.** An unparseable
  stored or environment value resolves as if unset. A plugin that needs a
  bounded number clamps it itself; see `plugins/dues`'s grace-period setting.
- **`label`, `description` and each option's `label` may be paired with a
  message key**: `labelKey`, `descriptionKey` and `options[].labelKey`,
  translated through the plugin's catalog with the literal as fallback.
- **`advanced: true` marks a setting as advanced** on the plugin's settings
  screen.
- **A setting has no `descriptionArgs`.** Unlike a plugin's own top-level
  description, a setting's `description`/`descriptionKey` is translated with no
  interpolation. A bound worth stating belongs in the catalog text.

## Migrations

Forward-only, like core's. Ids look like `0001_add_table` and are applied in
sort order by `meith upgrade`, in dependency order, one transaction each. There
is no plugin-run button for migrations: a schema change belongs to the deploy
that shipped the code expecting it. The panel reports which migrations have and
have not been applied.

> [!IMPORTANT]
> `definePlugin` refuses a migration list that is not written in ascending
> order. Otherwise a fresh board would apply everything, an upgraded board
> would skip the id that sorts before the last one applied, and the two
> would end up with different schemas and no error anywhere.

## Scheduled tasks

A task declares **exactly one** of two cadences, and `definePlugin` refuses one
that sets neither or both:

```ts
tasks: [
  { id: 'sweep', intervalSeconds: 900, run: async (ctx) => { /* … */ } },
  { id: 'digest', schedule: '0 9 * * 1', run: async (ctx) => { /* … */ } },
]
```

- **`intervalSeconds`** is a fixed cadence measured from the end of the last
  run, with a 60-second floor.
- **`schedule`** is a five-field cron expression,
  `minute hour day-of-month month day-of-week`, **evaluated in UTC**: there is
  no board timezone ([the default timezone is the
  reader's](../getting-started/mybb-parity.md)).

The expression is validated at `definePlugin` time, both that it parses and
that it can ever occur, so `0 0 30 2 *` is refused and a board with a bad
schedule fails to start. Fields are numeric (no `MON` or `JAN` names); `*`,
ranges (`1-5`), lists (`0,30`) and steps (`*/15`) are understood; `0` and `7`
both mean Sunday; and when both day-of-month and day-of-week are restricted a
day matching **either** one runs, the standard cron rule.

- **The 60-second floor holds for cron too.** The finest a five-field
  expression can ask for is `* * * * *`. A sixth (seconds) field is refused.
- **A scheduled task's first run is its next matching time _after_ it is
  registered.** It does not fire on install: a `0 9 * * 1` task added on a
  Wednesday first runs the coming Monday at 09:00 UTC.
- **A missed window fires once, not once per occurrence.** If the worker is
  down across one scheduled moment, or several, the task runs a single time on
  the next tick and is then scheduled forward. There is no backfill.

> [!IMPORTANT]
> **A cron schedule does not relax task idempotency.** The scheduler can
> still run a task more than once: two workers racing a claim, a retried
> tick, a missed window collapsing to one catch-up run. A task must be safe
> to double-fire and resumable from a partial run. The schedule decides
> _when_ a run may start, never that a run happens exactly once.

A task's failure is not swallowed: the scheduler records failures and notifies
administrators. The admin panel and the scheduler's health view describe a
scheduled task by the cadence between its upcoming runs, so a weekly task reads
as weekly. Core's own tasks are interval-only today.

## Versioning

`definePlugin` requires semver. The version is the plugin's own: the admin
panel shows it and its migration history is recorded against it. `apiVersion`
declares which plugin-kit major the plugin was written against. The same policy
as the [theme API](./themes.md#versioning) applies: a minor adds hooks, payload
fields and regions; a major may remove or rename one, and only after a
deprecation cycle.

## What is wired, and what is not

`scripts/hook-callsites.mjs` scans the tree, and the generated reference's
wired column comes from that scan. Every hook in the registry has a call site
in the board, and [Plugin hooks](../reference/plugin-hooks.md) carries the
count. Registering a handler for a hook that is not wired is legal and does
nothing. `plugins/reference` must handle every wired hook, enforced by its own
test; it also declares a route of every shape, a board page, a secret setting
with an environment override and a select. Everything declared runs today, the
four lifecycle callbacks included; on a fixture-mode board the runtime
capabilities reject with a clear error.

The generated reference is a gate. [Plugin hooks](../reference/plugin-hooks.md)
is written by `scripts/plugin-hook-docs.mjs` from the registry, and
`pnpm verify` runs `pnpm plugin:docs:check`, which fails when the file and the
code disagree; run `pnpm plugin:docs` and commit the result.
