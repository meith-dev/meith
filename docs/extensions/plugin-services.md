# Plugin settings, notifications and tasks

Declare settings, notify members and schedule background work through the plugin host. These capabilities depend on the board configuration and its running scheduler.

## Notifications

`context.notify` — on every runtime context — sends a member a notification
through the board's own system: the bell, an e-mail if the member wants one,
and a [pushed notification](../operations/web-push.md#web-push) if the board offers push and the
member asked for it. A plugin first declares its kinds as data:

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

The host owns the decisions a plugin must not:

- **Every kind is namespaced** — `plugin.<plugin>.<kind>` — and lands as its
  own line on the member's notification preferences screen, where the
  member decides which channels it reaches them by. `emailByDefault` and
  `pushByDefault` set the starting positions — push starts off unless a
  plugin asks otherwise — and the member's choice wins from then on.
- **An undeclared kind refuses at send.** Declaring kinds is what makes
  them legible to members; a plugin cannot invent one on the fly.
- **The words travel as data.** The subject (up to 200 characters) and body
  (up to 2,000) are rendered by the board on the bell and in the e-mail —
  the same template and the same unsubscribe machinery as every core
  notification.
- **`href` stays on the board.** A notification links to a board path,
  never off-site — the plugin's own pages are the place for anything
  external.
- **`dedupeKey` coalesces repeats** exactly as core kinds do: raising the
  same key again bumps a counter instead of stacking rows.
- **There is deliberately no fan-out primitive.** Sending is
  member-to-member scale, not broadcast; a plugin that wants to tell
  everyone something has the announcement system's front door like anybody
  else.

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

- **Resolution is environment, then board, then default** — the same rule
  as `APP_URL` and the mail settings. When the variable is set, the panel's
  box goes inert and says which variable owns it, so nobody edits a field
  that cannot take effect.
- **A secret is write-only.** `definePlugin` refuses one with a shipped
  default (a working fallback credential is a credential in the
  repository). The panel shows *that* a value is set, never the value, and
  a blank submit keeps what is stored — the form can never show the current
  value to re-submit. A secret's value reaches the plugin's runtime context
  and nowhere else.
- **`required` reports, it does not block.** An unset required setting is a
  named problem on the plugin's screen rather than a save that refuses
  everything else, so a board mid-setup can still be configured a field at
  a time.
- **A `select`'s option values are matched case-insensitively and
  trimmed**, so a stray `DUES_CURRENCY=EUR` or a trailing space from
  copy-pasting an environment value still finds the option `'eur'`
  declares — the resolved value is always the option's own declared
  casing, never the raw input. Declare option values lowercase.
- **A `select` whose stored value is no longer among its options** — an
  older version of the plugin declared more — resolves to the default
  instead of handing the plugin a value it never declared.
- **A `number` has no minimum, maximum or step to declare.** An unparseable
  stored or environment value resolves as if unset, falling through to the
  next source in the same order as everything else; a plugin that needs a
  bounded number clamps it itself when reading `context.settings` — see
  `plugins/dues`'s grace-period setting for the pattern.
- **A setting has no `descriptionArgs`** — unlike a plugin's own top-level
  description, a setting's `description`/`descriptionKey` is translated with
  no interpolation. A bound worth stating (a grace period's allowed range, a
  number's units) belongs in the catalog text itself, kept in sync by hand
  with whatever constant actually enforces it.

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
  run, with a 60-second floor — the tick is minute-granular at best, so
  anything under a minute claims a frequency the scheduler cannot deliver.
- **`schedule`** is a five-field cron expression — `minute hour
  day-of-month month day-of-week` — **evaluated in UTC**. There is no board
  timezone to evaluate it against (see [the default timezone is the
  reader's](../operations/mybb-parity.md)), so UTC is the only honest anchor,
  and it is stated in the type, in the error `definePlugin` throws, and here.

The expression is validated at `definePlugin` time, not at first tick — both
that it parses and that it can ever occur, so a well-formed impossibility
like `0 0 30 2 *` (February 30th) is refused rather than left to starve the
tick when its next-run time cannot be computed. A board with a bad schedule
fails to start rather than logging a stuck task weeks later. Fields are
numeric (no `MON` or `JAN` names); `*`, ranges (`1-5`), lists (`0,30`) and
steps (`*/15`) are understood; `0` and `7` both mean Sunday; and when both
day-of-month and day-of-week are restricted a day matching **either** one
runs, the standard cron rule.

- **The 60-second floor holds for cron too.** A five-field expression is
  minute-granular by construction — the finest it can ask for is
  `* * * * *`, once a minute. A sixth (seconds) field is refused for exactly
  that reason: it would ask for a cadence faster than the tick can deliver.
- **A scheduled task's first run is its next matching time _after_ it is
  registered.** It does not fire on install: a `0 9 * * 1` task added on a
  Wednesday first runs the coming Monday at 09:00 UTC, not the moment it
  ships.
- **A missed window fires once, not once per occurrence.** If the worker is
  down across one scheduled moment — or across several — the task runs a
  single time on the next tick and is then scheduled forward to its next
  future occurrence. There is no backfill; a weekly digest that slept
  through two Mondays sends one digest, not two.

> [!IMPORTANT]
> **Task idempotency is unchanged, and a cron schedule does not relax it.**
> The scheduler can still run a task more than once — two workers racing a
> claim, a retried tick, a missed window collapsing to a single catch-up
> run — so a task must be safe to double-fire and resumable from a partial
> run. Make the work idempotent (upsert, mark-then-act, a claimed cursor);
> the schedule decides _when_ a run may start, never that a run happens
> exactly once.

The admin panel and the scheduler's health view describe a scheduled task by
a cadence derived from the gap between its upcoming runs, so a weekly task
reads as weekly rather than as a task that has not run in seven days.

> Core's own tasks are interval-only today. Giving them cron schedules is a
> possible follow-up; this change adds the capability to the plugin API
> without converting them.
