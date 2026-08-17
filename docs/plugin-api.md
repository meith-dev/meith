# The plugin API

`@meith/plugin-kit` is the contract between the board and a plugin.

This document is the policy — what a plugin is, what it may and may not do, and
what the guarantees actually cover. The reference (every hook, every payload) is
generated into [Plugin hooks](./plugin-hooks.md).

## Writing a plugin

A plugin is a module that calls `definePlugin` and is registered in
`community.plugins.ts` — the installed list lives in its own file, beside
`community.config.ts`, so the operator CLI can read it without importing the
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

Installing it is `pnpm add`, a line in `community.plugins.ts`, and a redeploy.
That file holds your board's list and nothing else — this repository's own demo
and test boards keep their plugins in `community.demo.plugins.ts`, spread into
the list behind their flags, so what you read there is what your board runs.

> [!TIP]
> **[`examples/hello-plugin`](https://github.com/meith-dev/meith/tree/main/examples/hello-plugin)
> is the worked example to copy** — the smallest plugin that does something
> visible with each extension point: a footer-link filter, a region
> contribution, a setting, a migration, a task and an admin page, each with a
> comment saying why it is shaped the way it is. It ships as reference code
> rather than installed; [`examples/README.md`](https://github.com/meith-dev/meith/tree/main/examples)
> walks through registering it or your copy of it.

### What a plugin can declare

| Field | What it is |
|---|---|
| `hooks` | Handlers for named hooks. Filters change a value; events observe. |
| `settings` | Settings the admin panel renders, stored under `plugin.<key>.<name>`. |
| `migrations` | Forward-only SQL, applied in ascending id order and recorded per plugin. |
| `tasks` | Scheduled work, registered as `plugin.<key>.<id>` and run by the same tick as core's. |
| `adminPages` | Pages mounted under `/admin/plugins/<key>/`. |
| `routes` | HTTP endpoints mounted under `/api/plugins/<key>/`, dispatched by the host. |
| `pages` | Member-facing pages mounted under `/plugins/<key>/`, rendered inside the board's shell. |
| `notifications` | Notification kinds this plugin may send, each a line on the member's preferences screen. |
| `allowedRedirectHosts` | The only hosts an absolute redirect from this plugin's routes may point at. |
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
| Decide authorization | No hook filters `authorization.can()`, and none ever will. A plugin able to change that answer is a plugin able to grant itself anything. The one, narrow exception — putting a member in a group the operator pre-approved, for a limited time — is below, and the design of its refusals is what keeps it from being this row |
| Reach inside the visibility filter | No hook sits in the query path. A plugin that could rewrite a `where` clause could publish a private forum, and no amount of isolation makes that recoverable |
| See an `Actor` | Payloads carry `{ userId, isGuest }`. An `Actor` carries resolved group membership, which invites a plugin to make its own permission decision from group ids |
| Open a database connection | A plugin does not import `@meith/db` and never holds a connection. Its own tables are reachable through `context.data` — host-run, parameterised, under a database-side timeout — and its migrations can only create objects under its own prefix |
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
order or on how `community.config.ts` happens to list its plugins.

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

## Timed group grants

`context.grants` — on every runtime context — is the only write a plugin gets
against the board's own data: it can put a member in a usergroup **until a
date**. That is the whole API, deliberately. A usergroup already carries forum
permissions, a badge and a name colour, so time-limited membership of one is a
complete building block — a paid pass, a trial, a course cohort, an event's
temporary access, a reward a member can gift to another — and the host does
not know or care which of these a plugin is building.

```ts
await context.grants.grant({ userId, groupKey: 'supporters', until, reason: 'order 42 paid' })
await context.grants.extend({ userId, groupKey: 'supporters', until })
await context.grants.revoke({ userId, groupKey: 'supporters', reason: 'refunded' })
const held = await context.grants.list(userId)
```

What keeps this from being a plugin deciding authorization is the list of
things the host refuses, checked on every call:

- A group the operator has not marked **“may be granted by plugins”** on its
  admin screen. The opt-in is per group and off by default.
- A **system** or **staff** group, or any group whose permission set carries
  administrative or moderation power. The checkbox refuses these too, so the
  refusal is heard when the operator sets it up, not when the first grant fails.
- A grant with no expiry, an expiry in the past, or one more than two years
  out. Every grant lapses on its own.
- A membership **someone else** granted — an administrator's, another
  plugin's. `grant` refuses it, `revoke` leaves it alone.
- An empty `reason`. The reason is stored on the row; it is the audit trail.

A grant is an additive secondary membership by default: `primary_group_id` and
`display_group_id` are left alone, so nothing the plugin does changes how a
member is displayed or what happens when the grant ends — they fall back to
exactly what they were.

### Selling the group a member wears

`primary: true` on a grant asks for more than access — it asks for the group to
become the member's **primary** one, which is what a paid membership usually
means to the member buying it:

```ts
await context.grants.grant({ userId, groupKey: 'supporters', until, reason, primary: true })
```

The board does the swap, not the plugin, and it is reversible by construction:

- The group the member was primary in becomes an ordinary **secondary**
  membership, with no expiry, and the granted row remembers it in
  `previous_primary_group_id`.
- Promote a second time and the row still remembers the group behind *both*
  promotions, never a group that is itself only held until a date. A member who
  buys a second membership on top of a first cannot end up primary in a group
  they have stopped paying for.
- On `revoke`, and when the `groups.expire` tick collects the lapsed row, the
  remembered group is made primary again and the secondary row it left behind
  is removed. A `display_group_id` pointing at the group being taken away is
  cleared with it.
- **Actor assembly does the same fallback at the read.** A promoted primary
  whose grant has lapsed confers nothing, and the member's permissions are
  assembled from the remembered group instead — the same guarantee an ordinary
  grant makes, held to on the field that outlives the row.

Everything the host refuses above still applies: `primary: true` on a group an
operator has not opted in, on a staff group, or on one carrying power, is
refused as the grant itself is.

**And it never displaces a staff primary group.** Where the member is already
primary in a staff group, or one carrying administrative or moderation power,
the promotion is silently skipped: the grant still lands as an ordinary
secondary membership, so the member gets everything the group carries, but
their standing is left alone. Staff is appointed, and a plugin that could
demote an appointment by selling something is a plugin deciding who runs the
board. This is not an error and nothing is reported — the grant succeeded, and
a plugin has no business branching on whether the buyer is a moderator.

`grant` takes a plain `userId`, and nothing ties it to whoever is acting: who
may cause a grant for whom — a member for themselves, one member for another,
an automated rule for anyone — is the plugin's own policy, decided in its own
code with its own records.

**Expiry is true at the read, not enforced by a sweep.** Actor assembly skips
a lapsed row, so access ends at the boundary even if no task ever runs again —
uninstalling the plugin, stopping the tick, or the plugin's own bugs cannot
leave anyone holding access they no longer have. A `groups.expire` tick
deletes lapsed rows afterwards and bumps the permission version so derived
caches follow. Re-granting and extending only ever move an expiry **forward**:
a stale or replayed call cannot shorten what a member already holds.

Where the board runs on fixture data there is no membership table; every call
rejects with a clear error rather than pretending.

## A database of its own

`context.data` — on every runtime context — reads and writes the tables this
plugin's migrations created. Three methods, parameterised only:

```ts
await context.data.query('insert into plugin_example_entry (user_id, note) values ($1, $2)', [userId, note])
const row = await context.data.one('select * from plugin_example_entry where user_id = $1', [userId])
await context.data.tx(async (tx) => {
  // everything in here commits together or not at all
})
```

Three properties are the contract:

- **Values travel as `$1`, `$2`, …** and are bound by the driver. There is no
  string-building helper on purpose — the ordinary path is the safe one.
- **Every call runs under a database-side `statement_timeout`** — short in a
  page render, longer in a task. This is the one timeout in the plugin API
  that actually holds, because Postgres can abort a query where JavaScript
  cannot abort a handler.
- **`tx` is a real transaction.** A throw rolls the whole body back; a nested
  `tx` joins the outer one rather than opening a second.

### The namespace is enforced where it can be

`definePlugin` refuses a migration whose statements create, alter, drop or
fill anything not named `plugin_<key>_*` (hyphens in the key become
underscores) — and refuses a foreign key that reaches outside that namespace,
because a plugin table referencing a core one couples the plugin's schema to
the board's and breaks the moment either migrates. Copy ids into plain
columns instead; the reconcile-and-sweep shape handles rows whose subject has
since gone.

Stated honestly: this is a rail, not a sandbox. Plugin code runs in the
host's process, and `context.data` does not rewrite queries — a plugin *can*
select from a core table, the way any code in the process can. The migration
rule guards the part that would corrupt a board (a plugin altering somebody
else's schema); the rest is the same trust you extended when you installed
the code. There is no per-plugin database role today; if that changes, the
contract here does not.

## Looking up a member

`context.users` resolves a member to the pair a plugin is allowed to see —
`{ userId, username }` — by name or by id:

```ts
const recipient = await context.users.byUsername(input)   // null if unknown
```

It exists because a plugin's own records point at members, and its UI asks
for them by name — "award this to @name" needs an id before anything can be
stored. Deleted accounts do not resolve. Nothing richer is exposed — no
email, no state, no groups — for the same reason payloads carry a `ViewerRef`
and not an `Actor`.

## HTTP routes

A plugin declares endpoints the way it declares everything else — as data —
and the host mounts them under `/api/plugins/<key>/<path>`:

```ts
routes: [
  { path: 'hook/stripe', method: 'POST', access: 'anonymous', rawBody: true, handler },
  { path: 'checkout',    method: 'POST', access: 'member',    handler },
],
allowedRedirectHosts: ['checkout.stripe.com'],
```

A handler receives a `PluginRequest` — viewer, method, path, query, headers,
a parsed or raw body, the board's URL — plus the same runtime context as every
other surface, and answers with an envelope: `{ kind: 'json' | 'text' |
'redirect', … }`. A route declaring `rawBody: true` gets the exact request
bytes, which is what webhook signature verification needs.

**The host owns every decision a plugin must not:**

- **`access` is enforced before the handler runs.** `'member'` answers 401 to
  a guest; `'admin'` answers 403 to anyone without a live control-panel
  session — the same check the panel's own screens make, including its
  re-authentication window. The handler never sees a refused request.
- **Admin routes mount under the panel, not the board.** An `access: 'admin'`
  route answers at `/admin/api/plugins/<key>/<path>` and is a 404 on the
  board mount — and the reverse. The panel's session token is a cookie
  scoped to the `/admin` path precisely so it never rides an ordinary board
  request, which means an admin endpoint must live where that cookie
  travels. An admin page's form posts there; `pluginAdminRoutePath` builds
  the URL.
- **A member or admin POST must come from the board's own origin.** The
  Origin header is checked against the request's host; a cross-site form
  post is a 403.
- **An admin POST lands in the panel's action log** as `plugin.route` with
  the plugin key and path, next to every other administrative act. Admin
  GETs are reads and stay out of the log.
- **`cookie` and `authorization` never reach the handler**, and the response
  envelope has no header or cookie field at all. That single restriction is
  what stops a plugin route becoming a second authentication system.
- **Redirects are allow-listed.** A relative path always passes; an absolute
  URL must be https — plain http only to a loopback address, for a test
  double — and its host declared in `allowedRedirectHosts`, so a compromised
  setting cannot turn a board route into an open redirect.
- **Bodies are capped** — 64 KiB by default, `maxBodyBytes` up to 1 MiB.
- **Every response is `cache-control: no-store`.**
- **A disabled plugin's routes 404** — operator-disabled and auto-disabled
  alike. An off plugin has no endpoints, not broken ones.
- **Failures count.** A route runs under the same accounting as a hook:
  timed, logged against the plugin, and auto-disabling after repeated
  failures — visible on the plugin's health screen.

- **A route can declare its own rate limit** — `rateLimit: { limit, windowSeconds }`
  — and the host enforces it before the handler runs: a spent window answers
  429 with a `retry-after` header. The count is per caller (signed-in user id,
  else the client address) and per instance, in process memory — abuse
  pressure relief, not accounting. A board that scales out multiplies the
  budget by its instance count; declare limits with that honesty in mind.

One honest limit: route paths are exact matches — put ids in the query
string, not the path.

> [!NOTE]
> **A form POST cannot 303 off the board.** The board's CSP pins
> `form-action` to `'self'`, and browsers hold a form submission's whole
> redirect chain to it — so a member-form route answering a redirect to a
> payment provider is blocked by the browser, not by the host. The pattern
> that works, without weakening the policy: 303 to one of your own pages
> with the target in the query, validate it there against your
> `allowedRedirectHosts`, and render a meta refresh plus a fallback link.
> An ordinary navigation is outside `form-action`'s remit. `plugins/dues`
> ships this as its `go` page.

## Admin pages

`adminPages` are the operator-facing half, mounted at
`/admin/plugins/<key>/<path>`. `render` gets a `PluginAdminPageContext` — the
runtime context plus the panel URL's query string — and returns markup, which
the panel frames on `surface` so that whatever cards the page brings still read
as raised.

A plugin's pages are the plugin: its own screen in the panel says how it runs,
and these say what it is for. So a plugin that declares any becomes a place in
the panel rather than a row in a list, in three ways:

- **A tab bar across the top of every one of its screens**, the plugin's own
  screen included, which is labelled `Settings` and is the first tab. Moving
  between a plugin's screens is then the same gesture as moving between a
  forum's, and a plugin with one page gets no tab bar, because a single tab is
  not a choice.
- **Its own section in the panel's rail**, headed with the plugin's name and
  listing its pages, from the moment the operator is anywhere under
  `/admin/plugins/<key>` — the same way Users opens to show its own screens.
- **Links on its row of `/admin/plugins`**, so the screens are reachable
  before anyone opens the plugin at all.

Declaring a page is the whole of it. There is nothing to register with the nav
and no ordering to configure: the pages appear in the order the plugin declares
them, and a page on a disabled plugin appears nowhere.

**`title` is a label, so keep it short.** It is the tab, the rail entry and the
page's heading, and the plugin's name is already above all three — `'Plans'`,
not `'Dues — plans'`, which reads as the name twice everywhere it lands.

## Board pages

`pages` are the member-facing half, mounted at `/plugins/<key>/<path>` and
rendered inside the board's shell with the page's declared title, so a
plugin's screen looks like the board rather than an iframe of somewhere else:

```ts
pages: [
  { path: '',       title: 'Membership', access: 'member',    render },
  { path: 'return', title: 'Confirming', access: 'anonymous', render },
]
```

`render` gets a `PluginPageContext` — the runtime context plus the viewer,
the path, the query and the board URL — and returns markup. The same
containment as admin pages applies: a throw is logged and the page renders a
plain failure notice in the shell, not a 500. `access: 'member'` sends a
guest to the sign-in page and back to the plugin page afterwards. A page on a
disabled plugin is a 404, exactly like a route.

Build your markup in the render function rather than returning a component
that does work — the host's try/catch is around the call, and a component
that throws later, inside React's own render, cannot be contained from the
server.

## Notifications

`context.notify` — on every runtime context — sends a member a notification
through the board's own system: the bell, and an e-mail if the member wants
one. A plugin first declares its kinds as data:

```ts
notifications: [
  { key: 'gift_received', title: 'Somebody gifts you a membership',
    description: 'A member bought a membership in your name.' },
  { key: 'renewal_trouble', title: 'A membership payment fails',
    description: 'Your renewal did not go through; access holds while Stripe retries.',
    emailByDefault: false },
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

**The host owns the decisions a plugin must not:**

- **Every kind is namespaced** — `plugin.<plugin>.<kind>` — and lands as its
  own line on the member's notification preferences screen, where the member
  decides whether it e-mails them. `emailByDefault` sets the starting
  position; the member's choice wins from then on.
- **An undeclared kind refuses at send.** Declaring kinds is what makes them
  legible to members; a plugin cannot invent one on the fly.
- **The words travel as data.** The subject (up to 200 characters) and body
  (up to 2,000) are rendered by the board on the bell and in the e-mail — the
  same template, the same unsubscribe machinery as every core notification.
- **`href` stays on the board.** A notification links to a board path, never
  off-site — the plugin's own pages are the place for anything external.
- **`dedupeKey` coalesces repeats** exactly as core kinds do: raising the
  same key again bumps a counter instead of stacking rows.
- Sending is member-to-member scale, not broadcast: there is deliberately no
  fan-out primitive. A plugin that wants to tell everyone something has the
  announcement system's front door like anybody else.

## Settings

A setting declares a `type` when its default cannot say enough: `'secret'`
and `'select'` are strings with extra rules, and `env` names an environment
variable that overrides whatever the panel stores.

```ts
settings: [
  { key: 'secret_key', label: 'API secret', type: 'secret',
    env: 'MYPLUGIN_SECRET_KEY', required: true, default: '' },
  { key: 'mode', label: 'Mode', type: 'select', default: 'off',
    options: [{ value: 'off', label: 'Off' }, { value: 'live', label: 'Live' }] },
]
```

**Resolution is environment, then board, then default** — the same rule as
`APP_URL` and the mail settings. When the variable is set, the panel's box
goes inert and says which variable owns it, so nobody edits a field that
cannot take effect.

**A secret is write-only.** `definePlugin` refuses one with a shipped default
(a working fallback credential is a credential in the repository). The panel
shows *that* a value is set, never the value; a blank submit keeps what is
stored, because the form can never show the current value to re-submit. A
secret's value reaches the plugin's runtime context and nowhere else.

**`required` reports, it does not block.** An unset required setting is a
named problem on the plugin's screen — set it here or with `THE_VARIABLE` —
rather than a save that refuses everything else. A board mid-setup can still
be configured a field at a time.

A `select` whose stored value is no longer among its options — an older
version of the plugin declared more — resolves to the default instead of
handing the plugin a value it never declared.

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
product without something proving it fires. The same plugin declares a route
of every shape, a board page, a secret setting with an environment override
and a select — and its tests drive each one, so none of those surfaces can
silently rot either.

**The lifecycle callbacks do not run yet.** `onInstall`, `onEnable`,
`onDisable` and `onUninstall` are part of the declared shape and validated like
everything else, but no host code dispatches them today. Write them if the
shape of your plugin wants them — just do not put anything there that must run
for the plugin to be correct.

### The descriptors execute

Migrations are applied by `community upgrade` in dependency order, one transaction
each. Settings are stored at `plugin.<key>.<name>` and edited in the control
panel, with environment overrides resolved as described above. Tasks are
registered as `plugin.<key>.<id>` and run by the same tick as everything
else. Admin pages are mounted at `/admin/plugins/<key>/<path>`, routes at
`/api/plugins/<key>/<path>` (admin routes at `/admin/api/plugins/<key>/<path>`),
board pages at `/plugins/<key>/<path>`. The
runtime capabilities — `grants`, `data`, `users` — are live on every context;
on a fixture-mode board they reject with a clear error instead of
pretending.

What that leaves, stated plainly:

- **A page cannot reach anything a task cannot.** Both are handed the runtime
  context — resolved settings and a logger — and neither gets the `Actor`,
  the request, or a database handle. An admin page additionally sees the
  panel URL's query string (`PluginAdminPageContext.query`), which is what a
  post-redirect-get notice needs and nothing more. A page renders under an
  already-authenticated panel route; there is no per-page permission to
  declare, because a plugin does not get to make that decision. The acting
  half lives on routes: a route with `access: 'admin'` is the form target
  for an admin page's buttons, checked and logged by the host as described
  under [HTTP routes](#http-routes).
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
  out of `community.plugins.ts`, and a redeploy; a button that dropped the rows and
  left the code running would produce a state neither installing nor removing
  does.

## The generated reference is a gate

[Plugin hooks](./plugin-hooks.md) is written by `scripts/plugin-hook-docs.mjs`
from the registry. `pnpm verify` and CI run `pnpm plugin:docs:check`, which fails
when the file and the code disagree.

Hook documentation goes stale faster than most, because a hook is added in the
feature that needs it and documented, if at all, afterwards.

If the check fails, run `pnpm plugin:docs` and commit the result.
