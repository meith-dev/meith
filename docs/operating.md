# Running a board

Everything an operator needs, from an empty directory to a board that has been
running long enough to go wrong. Written for somebody who has not read the source
and is not going to.

- [Installing](#installing)
- [Configuration](#configuration)
- [Permissions](#permissions)
- [Themes](#themes)
- [Plugins](#plugins)
- [Content and announcements](#content-and-announcements)
- [Spam](#spam)
- [Migrations](#migrations)
- [Backup and restore](#backup-and-restore)
- [Connection pooling](#connection-pooling)
- [Troubleshooting](#troubleshooting)

## Installing

### The short version

```sh
npx create-meith my-board
cd my-board
npm install
cp .env.example .env.local     # fill in DATABASE_URL and AUTH_SECRET
npm run dev
```

Then open `/install`. Five steps, and the page names each one before it runs it:

| Step | What it does |
|---|---|
| Apply migrations | Creates every table, index and seeded usergroup. Forward-only. |
| Record the board's name | The only setting the installer writes; everything else has a default. |
| Create the administrator | Argon2id, the same registration path a member uses, then promoted. |
| Create a first forum | A category and one forum, so the index is not empty. |
| Disable the installer | **Irreversible.** `/install` answers 404 from here on. |

### The preflight is the useful part

Before it offers you a form, `/install` checks the environment and reports what
it finds. Read it — nearly every way a new board fails is visible here, and it is
much cheaper to see it now than to discover it under traffic.

The report separates two things, and the distinction matters more than it looks:

- **Blockers** mean installing cannot succeed. No `DATABASE_URL`, no
  `AUTH_SECRET`, cannot connect, already installed.
- **Warnings** mean installing will succeed and something will be wrong *later*.
  This is the more dangerous category, because nothing complains at the time.

The archetypal warning is the connection string. A board on the direct URL
installs perfectly, works in testing, and starts refusing connections the first
day it is busy — see [pooling](#connection-pooling). The installer warns rather
than blocks, because a self-hosted board on port 5432 is entirely correct, and an
installer that told that operator they were wrong would teach them to ignore it.

### Deploying it

The scaffold commits a `vercel.json` with the scheduled tick already wired, so a
deploy is a git push and three environment variables. Set `DATABASE_URL`,
`AUTH_SECRET` and `TICK_SECRET` on the platform *before* the first deploy —
`/install` will otherwise show you blockers instead of a form.

Install against the production database from the deployed URL, not from your
laptop. The installer seals itself when it finishes, and sealing it against a
database that is not the one you will serve leaves you with a board that cannot
be installed and an `/install` that 404s.

### If it fails halfway

The run stops at the first failed step and the page names it, with the error —
"installation failed" on its own tells nobody anything. Later steps are reported
as not run rather than as further failures, because one cause producing three
error messages is how an error screen stops being read.

The sealing step is deliberately **last**, so a failure before it leaves a board
you can fix and try again. What happens on that second attempt depends on how far
the first one got:

- **Failed before the administrator was created** — fix the cause and re-run.
  Migrations and the board-name setting are both safe to apply twice.
- **Failed after the administrator was created** — the installer will refuse. Its
  preflight blocks on *any* account existing, independently of the seal, because
  a second run would add a second administrator to a board that already has
  members. That is the one outcome an installer must make impossible, so it is
  gated twice.

If you are in the second case and the board is genuinely yours to reset, the
recovery is at the database, not in the installer: restore the empty database (or
drop and recreate it) and start again. If instead the only thing missing is
administrator access on an otherwise working board, do not reinstall — use
`forum user:promote`.

## Configuration

Three places, and they answer different questions:

| Where | What lives there | Changing it means |
|---|---|---|
| **Environment variables** | Secrets and the things that must be known before the board can read its own database — `DATABASE_URL`, `AUTH_SECRET`, `TICK_SECRET`. | A redeploy. |
| **`forum.config.ts`** | What is *installed*: themes and plugins. | An edit and a redeploy. |
| **`/admin/settings`** | Everything else: board name, registration mode, posting limits, search behaviour. | Takes effect immediately. |

The split is not arbitrary. Anything in `forum.config.ts` has to be visible to
the bundler — a serverless build contains only what it could see statically — so
"install a plugin" cannot be a database row. Anything in `/admin/settings` is a
value the running board reads, so it can change without a deploy.

`forum settings:list` prints the registry with defaults; `forum settings:set` and
`forum settings:get` work without a browser, which matters when the reason you
need them is that the panel will not load.

### Environment variables that matter

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes, for a real board | Use the **transaction-mode pooler** string. See [pooling](#connection-pooling). |
| `AUTH_SECRET` | Yes | Signs sessions and tokens. No default, deliberately. |
| `TICK_SECRET` | Yes in practice | Without it the scheduled tick refuses every call, and nothing fails visibly. |
| `APP_URL` | For mail and feeds | Absolute, no trailing slash. There is no request to be relative to when a digest is sent from the worker. |
| `DATA_SOURCE` | No | `postgres` or `fixture`. Defaults to `fixture` when `DATABASE_URL` is unset. |
| `ADMIN_IP_ALLOWLIST` | No | Comma-separated prefixes. Empty allows everything. |

Generate a secret with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Permissions

Three layers, resolved in order. Understanding the order is most of
understanding the model:

1. **The group's global permissions** — the bottom. A member's groups are
   combined, and for a boolean permission the answer is "any group grants it".
2. **The forum permission matrix** — per forum, per group, and each cell is
   three states: inherit, grant, deny. **Null means inherit**, which is why the
   editor has three states rather than a checkbox: a checkbox writes an explicit
   value into every cell on the first save, pinning the forum so a later change
   at the parent does nothing. That is the commonest way a board's permissions
   end up wrong.
3. **Moderator rights** — per forum, per member or group, granted separately.

Numeric permissions (post length, attachment count) combine as the **most
generous**, and **0 means unlimited** rather than none. A cell showing 0 is not a
restriction.

`/admin/forums` has the matrix. Each cell shows what it resolves to *and which
forum it inherited from*, because "inherit" on its own tells nobody anything.
Copy-to-subforums is previewed cell by cell and means *identical* — it clears
rows the source does not have, because a descendant that denied what the source
inherits would be two forums you were told now match.

**The one door no bypass opens** is `admincp.access`. Super-moderator and
administrator bypasses apply everywhere else and are logged.

## Themes

A theme is an npm package registered in `forum.config.ts`. Installing one is
`npm install`, a line in the config, and a redeploy — there is deliberately no
"switch theme" button, because the active theme is resolved once at module load
and a control that appeared to switch would either not work or cost first paint
a database read.

What you *can* change without a deploy is at `/admin/themes`: token values
(colours, radius, density), custom CSS, and an exact JSON export/import so a look
can be moved between boards. Reset deletes the override row rather than writing
empty values — the two look identical to every reader and only one leaves the
board as a fresh install.

Writing a theme: [`theme-api.md`](./theme-api.md). Every slot and model:
[`theme-slots.md`](./theme-slots.md).

## Plugins

Same shape: `npm install`, a line in `forum.config.ts`, a redeploy. There is no
upload-a-zip path and there will not be one — a plugin discovered at runtime is a
plugin that is not in the serverless bundle, so it would work in development and
be absent in production.

A plugin cannot decide authorization, cannot reach the visibility filter, cannot
open its own database connection and cannot patch core. Everything it can do is
in a typed registry, and the host catches its failures: a plugin that throws
leaves the page intact and is counted, logged and — after repeated failures —
switched off for the rest of the process.

**`/admin/plugins` is where you administer one after that.** It lists what is
installed, what each plugin attaches to, its settings, and — the part you cannot
find out anywhere else — whether its migrations have actually been applied to
*this* database.

Three things on that screen are worth knowing before you need them:

- **"Enabled" has three answers and the screen tells you which one you have.**
  Not in the build means editing `forum.config.ts` and redeploying. Switched off
  means somebody pressed the button here. Failing means the server stopped
  calling it after repeated errors, and the error is on the plugin's page.
- **The disable button is durable and takes effect everywhere**, not just on the
  server that handled the click, and it survives a redeploy. It is the thing to
  reach for when a plugin is misbehaving; you do not need to deploy to stop one.
- **The panel never runs migrations.** It tells you which are outstanding;
  `forum upgrade` applies them. A plugin with unapplied migrations is running
  against a schema that does not have what it expects, so treat that line as
  urgent rather than informational.

There is no uninstall button. Removing a plugin is `npm uninstall`, a line out of
`forum.config.ts`, and a redeploy — the same three steps in reverse. Its stored
settings stay behind, which is deliberate: reinstalling it should not lose your
configuration.

Writing one: [`plugin-api.md`](./plugin-api.md). Every hook:
[`plugin-hooks.md`](./plugin-hooks.md).

## Content and announcements

`/admin/content` holds the board-wide vocabularies: the word filter, thread
prefixes, smilies and custom BBCode, with attachments and announcements on their
own screens beside them.

**One difference matters operationally.** The word filter is applied when a post
is *shown*, so adding or removing one takes effect everywhere on the next page
load and costs nothing. Smilies and custom BBCode are not like that — they
decide what a post *renders to*, so changing them marks every stored render on
the board out of date. Nothing breaks: those posts render correctly on demand
and are rewritten in the background by the same tick that runs everything else.
On a large board expect a period of extra rendering after such a change, and
expect `/admin/system` to report a backlog until it clears.

A custom BBCode tag chooses a name and whether it is inline or block. There is
deliberately no replacement-pattern field — if you need bespoke markup, that is
a plugin, where the code is reviewed rather than typed into a form.

**Deleting an attachment does not touch the post it was on.** Attachments are
listed beside a post rather than written into it, so removing one takes an entry
off a list and nothing else. The bytes go to the hourly sweep rather than being
deleted immediately.

**An announcement is not a pinned thread.** Nobody can reply to one, it expires
on its own date, and removing it removes nothing anybody wrote — which is why it
is safe to delete and a sticky thread is not. Dates are entered in UTC.

## Spam

`/admin/antispam` holds the registration questions; the numbers are in
`/admin/settings` under **Anti-spam**. Everything except the hidden-field trap
ships switched off, deliberately — a fresh board has no spam on it, and a
feature that arrives switched on introduces itself by breaking your registration
form.

**What each control is actually worth**, because they are not equivalent and
they are all oversold:

| Control | Stops | Costs a real visitor |
|---|---|---|
| Hidden-field trap | Bots that fill every field | Nothing. Leave it on. |
| Minimum fill time | Instant submissions | Occasionally somebody with a password manager. Keep it at a few seconds. |
| A question | Scripted registration | A moment, every time. Switch it on when you have a problem. |
| Hold first posts | Nearly all forum spam | One wait for each genuine new member. |
| Hourly limits | A night's work by one script | Nothing, if set sensibly. |

**Holding a new member's first posts is the effective one.** Spam accounts post
once or twice and never come back, so a threshold of two or three catches most
of it. Held posts go to the moderation queue like anything else.

**Limits and the flood interval are different controls.** The interval
(`posting.flood_seconds`) sets a minimum gap between two actions and stops a
double-click. A limit bounds how many in an hour and stops a script posting
steadily all night — which satisfies any interval you would be willing to set.
Use both. Members with **bypass flood check** are exempt from both.

The limits are counted in the database, so every instance of your board shares
one allowance rather than one each. The counters are pruned hourly by the tick;
if the tick is stopped, they accumulate — which `/admin/system` will tell you
about before this does.

**If registration stops working**, check `/admin/antispam` first. A question
challenge switched on with no question configured does *nothing* rather than
refusing everybody — that is deliberate, and the screen says so in red — but a
minimum fill time set to a minute will quietly turn away most real applicants.

**No hosted captcha is offered.** Not because it is hard: it means every
visitor's browser contacting a third party before they can join your board,
which is a decision about your members rather than a setting. The provider seam
is there if you want one — see `packages/antispam` — and it is a small module,
not a fork.

## Migrations

Forward-only. There is no down migration and there will not be one: a migration
that drops a column is a data-loss button on a live board, and some migrations
cannot be reversed at all — so a "roll back" that worked for half of them and
silently did nothing for the rest would be worse than its absence.

```sh
npm run forum -- migrate      # core only
npm run forum -- upgrade      # core, then plugins, then record the version
```

The admin panel shows a notice when the deployed code is ahead of the database.
Full procedure, including how far you can jump: [`upgrading.md`](./upgrading.md).

## Backup and restore

**The backup is the rollback plan.** Because migrations are forward-only, restore
is the only way back — so this is not a precaution, it is the recovery procedure,
and it is worth testing before you need it.

### What to back up

Two things, and only one of them is the database:

1. **The database.** Everything the board knows: accounts, posts, settings,
   permissions, theme overrides.
2. **Uploaded files** — attachments and avatars — if your file driver is local
   disk. On S3 or a compatible store the files are already somewhere else, and
   the bucket has its own backup story.

The code is in git and does not need backing up. `.env` values are in your
platform's environment; keep them somewhere you can reach when the platform is
the thing that is broken.

### Taking one

```sh
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" > board.dump
```

`--format=custom` because it restores selectively and compresses; `--no-owner`
and `--no-privileges` because the role names on a managed platform are not the
ones you will restore into.

**Use the direct connection string for a dump, not the pooler.** A transaction
pooler does not support the session-level operations `pg_dump` needs, and the
failure is confusing — a dump that starts and then stops. This is the one
operation that wants the direct URL.

### Restoring

```sh
createdb forum_restored
pg_restore --no-owner --no-privileges --dbname="$RESTORE_URL" board.dump
```

Restore into a **new database** first and point a staging deployment at it. A
restore over a live database is how a bad backup becomes two lost boards.

Then check three things, in this order:

1. `select count(*) from posts;` — is the content there?
2. Sign in as an administrator — did the credentials survive?
3. `npm run forum -- migrate` — is the schema at the version the code expects?

### Rehearse it

A backup nobody has restored is a file, not a backup. Restore one into a scratch
database once, before you need to, and note how long it took — that number is
your recovery time, and finding it out during an incident is the wrong moment.

## Connection pooling

**This is the single most common way a serverless board breaks**, and it does not
break during testing.

Every function instance opens its own database connection. Postgres runs out at
around a hundred, and a platform that scales to fifty instances under load will
exhaust that — so the board works perfectly while you are the only visitor and
starts refusing connections the day it is busy, with an error that names the
database rather than the cause.

Use the **transaction-mode pooler** connection string. On Supabase it is the one
on port `6543`, not `5432`. The installer warns when the URL does not look like a
pooler.

Two consequences worth knowing:

- **Prepared statements are off.** A transaction pooler hands a different backend
  to each transaction, so a prepared statement from one is not there for the
  next. The database layer is configured for this; a plugin issuing raw SQL
  should be too.
- **`pg_dump` and DDL want the direct URL.** Both need session-level state. Set
  `DIRECT_DATABASE_URL` for migrations if your platform provides both strings.

Self-hosting against your own Postgres with a fixed number of server processes?
None of this applies — use the ordinary connection string.

## Troubleshooting

### The board is up but nothing happens on a schedule

Bans do not expire, digests do not send, counters drift, uploads are not swept.
Nothing errors, because nothing ran.

Check `/admin/system`. The tick's status is there, and a stale one is called out
loudly. Then check that `TICK_SECRET` is set and that your platform's cron is
actually calling `/api/system/tick` — on Vercel that is `vercel.json`, which the
scaffold commits.

### "Too many connections"

See [pooling](#connection-pooling). It is almost always the direct connection
string.

### The admin panel 404s

Three possibilities, in order of likelihood:

1. `ADMIN_IP_ALLOWLIST` is set and your address is not in it. The panel answers
   404 rather than 403 from outside the allowlist, deliberately — its value is
   being invisible.
2. Your account is not in a group with `admincp.access`.
3. Your admin session expired. It has a 30-minute idle timeout and an 8-hour
   ceiling, separate from your board session.

### A member cannot see a forum they should

Read the matrix at `/admin/forums` for that forum, and read the *row for their
group* rather than reasoning about the combination. Each cell says what it
resolves to and where it inherited from. The usual cause is an explicit deny
somewhere up the tree, which inheritance carries down.

### Counters look wrong

`/admin/system` → Recount & Rebuild. It is resumable and safe to run on a live
board. Counters drifting is what the tool exists for; if they drift *again*, the
outbox is not being drained — see the tick.

### An imported board's old links 404

`board.legacy_redirects` is off by default. Turn it on at `/admin/settings`.
It needs an import to have run, because the redirect is a lookup in the legacy id
map.

### Everything is broken and the panel will not load

The CLI does not need the web app:

```sh
npm run forum -- env:check       # is the environment valid, and can it connect?
npm run forum -- settings:list   # what the board thinks its settings are
npm run forum -- task:list       # what is scheduled, and when each last ran
npm run forum -- migrate         # is the schema behind the code?
```

`forum --help` lists everything. The commands that exist are the ones listed
there — this project does not document a command it has not written, and if one
you expected is missing, it is missing rather than hidden.

### Getting help

Every error page carries a **request id**. Quote it: the board's logs are
correlated by it, and it turns "a page broke" into one grep.
