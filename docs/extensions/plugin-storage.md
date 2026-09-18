# Plugin storage, groups and migrations

Store plugin data, apply forward-only migrations and work with explicitly grantable groups. The namespace and visibility rules are part of the plugin security boundary.

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
the operator's kill switch. A plugin cannot declare it — setting names
cannot start with an underscore — so the collision is impossible rather
than unlikely.

`definePlugin` refuses a key, setting name, task id or page path that would
not namespace cleanly: a dot in a plugin key would produce an ambiguous
setting key, and a slash in a page path would escape the admin prefix.

## Timed group grants

`context.grants` — available on every runtime context — is the only write a
plugin gets against the board's own data: it can put a member in a usergroup
**until a date**. That is the whole API, deliberately. A usergroup already
carries forum permissions, a badge and a name colour, so time-limited
membership of one is a complete building block — a paid pass, a trial, a
course cohort, an event's temporary access — and the host does not know or
care which of these a plugin is building.

```ts
await context.grants.grant({ userId, groupKey: 'supporters', until, reason: 'order 42 paid' })
await context.grants.extend({ userId, groupKey: 'supporters', until })
await context.grants.revoke({ userId, groupKey: 'supporters', reason: 'refunded' })
const granted = await context.grants.list(userId)
const isSupporter = await context.grants.holds(userId, 'supporters')
```

What keeps this from being "a plugin deciding authorization" is the list of
things the host refuses, checked on every call:

- A group the operator has not marked **"may be granted by plugins"** on its
  admin screen. The opt-in is per group and off by default.
- A **system** or **staff** group, or any group whose permission set carries
  administrative or moderation power. The admin checkbox refuses these too,
  so the refusal is heard at setup time, not when the first grant fails.
- A grant with no expiry, an expiry in the past, or one more than two years
  out. Every grant lapses on its own.
- A membership **someone else** granted — an administrator's, or another
  plugin's. `grant` refuses it and `revoke` leaves it alone.
- An empty `reason`. The reason is stored on the row; it is the audit
  trail.

A grant is an additive secondary membership by default: the member's primary
and display groups are left alone, so the group leading their name does not
change — though the granted group can appear as an extra title, as far as
[Maximum displayed groups](../administration/groups.md)
allows — and when the grant ends everything falls back to exactly what it
was.

**Expiry is true at the read, not enforced by a sweep.** Actor assembly
skips a lapsed row, so access ends at the boundary even if no task ever runs
again — uninstalling the plugin, stopping the tick, or the plugin's own bugs
cannot leave anyone holding access they no longer have. A `groups.expire`
task deletes lapsed rows afterwards and bumps the permission version so
derived caches follow. Re-granting and extending only ever move an expiry
**forward**: a stale or replayed call cannot shorten what a member already
holds.

### Reading whether a member holds a group

`list` reports only the grants **this plugin** made. `holds` answers a
different question — *does this member hold this group right now* — and it
does not care how the membership arose: a primary group, a plain secondary,
a grant from an administrator or from another plugin all count. The question
is "holds", not "was granted by me".

```ts
const isSupporter = await context.grants.holds(userId, 'supporters')
```

It is **read-side of the same privacy line as the write.** A plugin is never
handed group membership — the viewer on a payload is `{ userId, isGuest }`,
never an `Actor` — and `holds` does not widen that. It reads only groups the
operator has ticked **"may be granted by plugins"**, the same opt-in `grant`
requires. Ticking it is the operator's consent to make that one group's
membership plugin-visible, in both directions; every other group stays
invisible.

So the refusals mirror the write side:

- A group the operator has **not** opted in returns `false` — the same answer
  as a member who is not in it, and deliberately so. A plugin cannot tell an
  opted-out group apart from one nobody holds, and cannot probe for a group's
  existence. A group key that names nothing returns `false` for the same
  reason.
- A **system** or **staff** group, or one whose permissions carry
  administrative or moderation power, is **refused** even if it has somehow
  been marked grantable — membership of those is never a plugin's to read,
  exactly as it is never a plugin's to grant.

`holds` reads standing the same way the board itself does: a grant that has
lapsed confers nothing from the moment it expires, before any sweep deletes
its row, and a promotion whose grant has lapsed falls back to the group
behind it. On a fixture-mode board, where there is no membership table, it
refuses with a clear error rather than guessing.

### Selling the group a member wears

`primary: true` on a grant asks for more than access — it asks for the group
to become the member's **primary** one, which is usually what a paid
membership means to the member buying it:

```ts
await context.grants.grant({ userId, groupKey: 'supporters', until, reason, primary: true })
```

The board does the swap, not the plugin, and it is reversible by
construction:

- The group the member was primary in becomes an ordinary secondary
  membership with no expiry, and the granted row remembers it in
  `previous_primary_group_id`.
- A second promotion on top of a first still remembers the group behind
  *both*, never a group that is itself only held until a date — so a member
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
is silently skipped — the grant still lands as a secondary membership, so
they get everything the group carries, but their standing is left alone.
This is not an error and nothing is reported; a plugin has no business
branching on whether the buyer is a moderator.

`grant` takes a plain `userId`, and nothing ties it to whoever is acting.
Who may cause a grant for whom — a member for themselves, one member for
another, an automated rule for anyone — is the plugin's own policy, decided
in its own code with its own records.

On a fixture-mode board there is no membership table, and every call rejects
with a clear error rather than pretending.

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

- **Values travel as `$1`, `$2`, …** and are bound by the driver. There is
  no string-building helper, on purpose — the ordinary path is the safe
  one.
- **Every call runs under a database-side `statement_timeout`** — short in a
  page render, longer in a task. This is the one timeout in the plugin API
  that actually holds, because Postgres can abort a query where JavaScript
  cannot abort a handler.
- **`tx` is a real transaction.** A throw rolls the whole body back; a
  nested `tx` joins the outer one rather than opening a second.
- **Every statement runs as this plugin's own database role**, which the
  database only lets touch `plugin_<key>_*` tables — see [below](#the-namespace-is-a-database-boundary).

### The namespace is a database boundary

`definePlugin` refuses a migration whose statements create, alter, drop or
fill anything not named `plugin_<key>_*` (hyphens in the key become
underscores) — and refuses a foreign key that reaches outside that
namespace, because a plugin table referencing a core one couples the
plugin's schema to the board's and breaks the moment either migrates. Copy
ids into plain columns instead; the reconcile-and-sweep pattern handles rows
whose subject has since gone.

`context.data` holds the same line at runtime, and Postgres enforces it.
Each plugin owns a dedicated database role — `plugin_<key>` — that is granted
nothing but `select`, `insert`, `update` and `delete` on its own
`plugin_<key>_*` tables and their sequences. The host runs every
`context.data` statement inside its transaction after `set local role
plugin_<key>`, and the role resets when the transaction ends. A statement
that reads a core table, touches another plugin's table, or attempts DDL is
refused by the database with `permission denied`, whatever shape the SQL
takes — so an author who trusts this guard and, by mistake, concatenates a
request value into the statement text still cannot reach past their own
tables with it. The role is created and its grants brought up to date when
the plugin's migrations run, so a board's database user must be able to
create roles (the bundled Postgres runs as a superuser and already can); a
managed database whose login lacks that privilege needs the `plugin_<key>`
roles created once by an administrator.

Stated honestly: this bounds the documented channel, not the process.
Plugin code runs in the host's process and can still open its own connection
or read `DATABASE_URL` — installing a plugin extends that trust. What the
role guarantees is the blast radius of a *bug*: anything issued through
`context.data` can only ever touch this plugin's own tables.

## Looking up a member

`context.users` resolves a member to the pair a plugin is allowed to see —
`{ userId, username }` — by name or by id:

```ts
const recipient = await context.users.byUsername(input)   // null if unknown
```

It exists because a plugin's own records point at members and its UI asks
for them by name — "award this to @name" needs an id before anything can be
stored. Deleted accounts do not resolve.

`standing(userIds)` returns those pairs plus `postCount`, `threadCount`,
`reputation` and `registeredAt` (a `Date`) for at most 200 ids; more ids
throw. `scan({ afterUserId, limit })` returns the same shape in ascending
user-id order, strictly after the cursor, with the limit clamped to 0–200.
Both exclude deleted accounts. An empty scan marks the end of a pass; use
the last returned user id to continue.

These four public numbers do not move the privacy line: post and thread
counts, reputation and registration date are already on every postbit.
Nothing else is exposed — no e-mail, state or groups — for the same reason
payloads carry a `ViewerRef` and not an `Actor`.

## Migrations

Forward-only, like core's, and for the same reason: a down migration that
drops a column is a data-loss button on a live board.

Ids look like `0001_add_table` and are applied in sort order.

> [!IMPORTANT]
> `definePlugin` refuses a migration list that is not written in ascending
> order, because the failure would otherwise be silent: a fresh board
> applies everything, an upgraded board skips the id that sorts before the
> last one applied, and the two boards end up with different schemas and no
> error anywhere.
