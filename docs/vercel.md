# Running on Vercel

A Meith board runs on Vercel from a Deploy Button: one click provisions the
database, cache, object store and mail account, you generate two secrets,
and the board is live. [Deploy it](#deploy-it) is that route, and it is
four steps long.

The rest of this page is the part worth reading before you commit — what
this route cannot do, what it costs, and the handful of places where a
platform of functions behaves differently from a server you own. It ends
with [how to leave](#leaving-vercel), because that is what decides whether
this is a home or a trap.

This is a narrower route than the [Quickstart](./quickstart.md), not a
better one. There is no server to SSH into, no worker process, no disk, and
no `docker compose run` to reach for when something needs a command run
against the board. What you get in exchange is that none of those are yours
to keep alive.

## Deploy it

**1. Press the Deploy Button** in the
[template's README](https://github.com/meith-dev/vercel-template). Vercel
clones the template into a repository of your own and opens the deploy
form.

**2. Connect the four products it asks for.** They arrive as part of the
form rather than as configuration afterwards, and each one publishes its
own credentials into the project:

| | |
|---|---|
| **Neon** | Postgres. Publishes both connection strings — pooled and direct. |
| **Upstash** | Redis, for the cache. |
| **Vercel Blob** | Uploads. Publishes a store id; there is no token to copy. |
| **Resend** | Mail. Publishes its API key and the domain it sends from. |

**3. Fill in the two secrets the form asks for.** Nothing can supply these
— they are yours, and they are the only fields on the form:

```sh
openssl rand -hex 32   # AUTH_SECRET
openssl rand -hex 32   # CRON_SECRET
```

Thirty-two characters is a floor the board enforces at boot, not a
suggestion. Vercel's own cron documentation suggests a 16-character
`CRON_SECRET`; that value is refused here. Generate each separately.

**4. Deploy, then open `https://your-deployment/install`.** The build
applies the schema and builds the board; the installer asks for the board's
name, your account, and nothing else. When it finishes it seals itself and
`/install` answers 404 from then on.

That is the whole route. Everything the board needs beyond those two
secrets is derived from what the four products publish — the drivers, both
database strings, the Redis URL, and the mail sender — which is why the
form asks for two fields rather than sixteen. [What the board looks
for](#what-the-board-looks-for-and-in-what-order) is the full order of
resolution, and matters only when something does not resolve.

> [!NOTE]
> **`APP_URL` is the one value to check afterwards.** Every link in every
> password-reset and confirmation e-mail is built from it. A preview URL
> left in it is a board whose reset links point at a deployment that will
> not exist next week.

## Before you commit to this route

Whether this route suits the board you have in mind is decided by what it
is for, what it costs, and what it cannot do. The third is the one to read
twice: those limits are properties of running on functions, and no amount
of configuration moves them.

### Who this route is for

Take it if:

- **you have no server and no wish to acquire one.** Nobody on the
  committee has to learn `ufw`, renew a certificate, or notice that a disk
  filled up.
- **traffic is bursty.** A board that is quiet for six days and busy on
  club night pays for the busy part rather than for a machine sized to it.
- **you are already on Vercel** and adding one more project is less work
  than adding the first server.

Do not take it if:

- **where the data lives is the point.** This route spreads a board across
  a platform, a managed database, a managed cache and an object store —
  four companies holding your members' posts, none of them you. If that
  sentence is the reason your community is leaving whatever it is leaving,
  stop here and read [Deploying by hand](./self-hosting.md) instead. One
  machine you rent, one database on it, one `pg_dump` that is the whole
  board. That is the honest answer to data sovereignty, and this page is
  not it.
- **you want the documented default.** A server is still what most boards
  should run, and what most of this documentation assumes.
- **you are importing a large MyBB or phpBB board.** The importer is a
  long-running command against two databases; see
  [the limits](#the-limits-worth-knowing-first).

> [!NOTE]
> **This route is not covered by an automated deployment test.** The
> drivers underneath it are — the cache contract suite runs against a real
> Redis-compatible server on every CI run, and the environment rules below
> are unit-tested — but nothing in CI deploys a board to Vercel and checks
> that it came up. Treat a Vercel deploy as something you verify yourself,
> the same way you would verify any deployment nobody has rehearsed for
> you.

### What it costs

Usage-based, and spread across four bills rather than one:

| Service | What it is | Notes |
|---|---|---|
| Vercel | Serving the board, and the cron scheduler | A tick faster than daily needs a paid plan — see [the tick](#the-tick-replaces-the-worker) |
| Managed PostgreSQL | Everything durable: posts, members, sessions, the queue | Needs both a pooled and a direct connection string |
| Managed Redis | The shared cache, and nothing else | Losing it costs a warm cache, not data |
| Object storage | Avatars and attachments | A Vercel Blob store, which is on the Vercel bill and provisions itself, or any S3-compatible bucket: R2, S3, Spaces, MinIO |

Some providers bundle two of these, which makes it three bills rather than
four. None of them bundle all of it. A single rented server running the
[Quickstart](./quickstart.md) is one bill, a fixed one, and usually a
smaller one — the case for this route is the operational work it removes,
not the money.

### The limits worth knowing first

**Large imports stay a CLI job against the database.** Moving a MyBB or
phpBB board across is one long-running command that reads the old board's
MySQL database and copies its uploads directory as files. It is resumable
by design — it stops at its row budget and you run it again — but it is a
command you run from a machine with a terminal, not something a function
does. Run it from a checkout of your board repository, pointed at the same
`DATABASE_URL`, and follow
[Migrating from MyBB or phpBB](./migrating.md).

**Uploads and downloads both buffer wholly in function memory.** The board
uploads each object in a single request rather than a multipart one,
holding the whole file in memory while it is processed and sent; reads have
the same ceiling, because the download route buffers the whole object
before it answers. So **the function's memory limit — not the bucket —
caps attachment size, in both directions**. An attachment uploaded on a
larger function will exhaust a smaller one on the way back down. Set the
board's own attachment limit below what the function can hold, and remember
it applies to serving as well as receiving.

**Redis connections scale with concurrent instances**, and the platform
decides how many of those exist. A traffic spike that creates two hundred
instances wants two hundred connections; a managed Redis plan with a
connection cap will start refusing them. Pick a plan whose cap is above the
concurrency the board is allowed to reach.

**Objects are public only if the bucket is.** The board sends no ACL on a
write, so per-file visibility is accepted and ignored. Serving uploads
publicly is a decision made on the bucket, not per file.

**There is no `docker compose run`.** Every operator command in
[Operations](./operating.md) still exists, but you run it from a checkout
of your board repository with the production environment in front of it,
rather than inside a container on a server.

## Things to know

Each of these is a property of running on functions rather than a bug, and
each one has surprised someone. Nothing here is needed to deploy — come
back to it when something behaves unlike the server you expected.

### The tick replaces the worker

A Compose deployment has something ticking every 60 seconds without being
asked: the compiled `apps/worker` process in this repository's own image,
or — in a scaffolded board's own compose file, since `@meith/worker` is not
published — a small container looping against the tick endpoint. There is
no such thing here. The same tick is available over HTTP at
`/api/system/tick`, and Vercel Cron calls it on a schedule instead. Nothing else changes: the HTTP tick runs the identical tick over
the identical task list, and tasks claim their work through the database,
so an overlapping call cannot double-process anything.

Declare the schedule in `vercel.json` at the root of the project:

```json
{
  "crons": [{ "path": "/api/system/tick", "schedule": "0 3 * * *" }]
}
```

Vercel documents that it calls the path with
`Authorization: Bearer <CRON_SECRET>` — exactly that header, under exactly
that variable name, and it cannot be told to send another. That is why this
route sets `CRON_SECRET` rather than `TICK_SECRET`: the endpoint accepts
either, and either on its own protects it, but only one of them is a name
Vercel will send. Setting both is fine.

> [!IMPORTANT]
> **32 characters, not 16.** Vercel's own cron documentation suggests a
> 16-character `CRON_SECRET`. This board holds it to the same floor as
> every other secret it reads and refuses to boot on anything shorter, so a
> value generated by following those instructions is rejected here. The fix
> is a longer secret, not a lower floor.

#### The cadence caveat, stated plainly

**A Hobby plan refuses a schedule faster than daily, and refuses it at
deploy time.** It does not accept the expression and run it less often: the
deployment fails, with the cron expression named in the error. Only a paid
plan accepts an arbitrary one.

That is why the template ships `0 3 * * *` — a daily tick deploys on every
plan. On a paid plan, change it to `* * * * *` and the board ticks every
minute.

Nothing is lost at a sparse cadence. Every task carries its own interval
and is skipped when it is not due, and tasks are written so that a missed
run **delays** work rather than dropping it. What stretches is latency —
and three of the shortest-interval tasks are the chain behind everything a
member actually notices:

| Task | What it drives |
|---|---|
| `outbox.relay` | Moves committed events onto the queue |
| `queue.drain` | Executes the queued jobs |
| `subscriptions.instant` | Tells "as it happens" subscribers about new posts |

At a daily tick, "notify me as it happens" becomes a daily digest in all
but name, a new post is not findable in search until the next run, and
queued mail waits for the same tick. Say that out loud before promising a
community instant notifications on a Hobby plan.

A password reset is **not** among them: that mail is sent while the request
is handled, so nobody is locked out of an account by a sparse tick.

A board that wants a minute-by-minute tick without paying Vercel for it
drives the endpoint from anything else that can call a URL on a schedule —
a GitHub Actions workflow, a systemd timer on some other machine, an uptime
pinger — presenting `TICK_SECRET` as a bearer token. That works
identically; the endpoint does not care who called it.

#### `maxDuration` is checked at build time

The tick route declares `maxDuration = 300`. Vercel documents that this
figure is checked when the project **builds**, not when the function runs
— so a plan that does not allow it fails the deployment rather than
clamping the request.

300 is a ceiling, not a guarantee that every tick fits inside it. The four
per-minute tasks are each aborted at their own budget, and those budgets
add up to roughly six minutes if every one of them runs to its limit in the
same tick — the scheduler runs them one after another, not in parallel.
That is survivable rather than alarming: **a tick killed mid-run leaves its
claims to expire after 15 minutes, and the next tick picks the work up.**
Nothing is lost, and in practice the tasks do not all run to their limits
at once.

With [Fluid Compute](https://vercel.com/docs/fluid-compute), which Vercel
makes the default for new projects, Hobby allows up to 300 seconds and the
declaration builds as written. With Fluid Compute switched off, Hobby caps
a function at 60 seconds and **this build fails**. Turning Fluid Compute
back on is the fix available to you: the constant lives inside the
published `@meith/web` package rather than in your board repository, so it
is not a line you can edit in your own checkout.

[Monitoring § Driving the tick over HTTP](./monitoring.md#driving-the-tick-over-http)
has the request and response contract, including what each status code
means to a scheduler.

### What build-time migration means

Welding the migration to the build buys the `&&` guarantee, and it costs
three things. All three are properties of the arrangement rather than bugs,
and [Upgrading § When the build runs the migration](./upgrading.md#when-the-build-runs-the-migration)
is the full treatment.

#### The deploy window is inverted, not closed

When the deploy and the migration are separate events, new code serves
against an old schema until somebody runs the command. Build-time migration
does not remove that window — it turns it around. The migration runs during
the build, while the **previous** deployment is still serving, so between
the migration and the cutover it is **old code against a new schema**.

For a release that only adds things, that is safe. For one that removes or
renames, the two-step rule still holds but you no longer get to order its
steps, which leaves a single invariant:

> A release's migration must be tolerated by the release *before* it,
> because that is the code serving while this release's build migrates.

So a destructive migration cannot travel in the same release as the code
that tolerates it. Those have to be two deploys.

#### Every build migrates, previews included

The build command is the build command. It runs for every deployment the
platform builds: the pull-request preview, the branch deployment, the
redeploy of an old commit. Each one runs `community migrate` against
whatever database that deployment's own environment variables name.

This is where the pattern cuts, and Vercel's default is on the wrong side
of it. **Vercel documents that a new environment variable applies to all
environments unless you narrow it**, which points preview and branch builds
at the production database — and then the first preview build of an
unmerged branch migrates production, from a schema nobody has reviewed,
with no deploy of that branch ever having happened. Nothing in the build
command can detect this: from the migration's point of view it is an
ordinary run against an ordinary `DATABASE_URL`.

> [!CAUTION]
> **Scope `DATABASE_URL` and `DIRECT_DATABASE_URL` to Production only**,
> and give preview and branch environments a database of their own — a
> separate instance, or a branch of the managed one where the provider
> offers that. Check the scoping before the first preview build rather than
> after. By the time it is visible the migration has applied, and a
> migration does not come back off.

Overlapping deploys themselves are safe. Two builds triggered close
together queue on the advisory lock, and the second finds the schema
current and applies nothing.

#### Rollback does not un-migrate

Vercel documents its instant rollback as promoting a previous deployment
by re-pointing an alias at an artefact that was built already. That
**runs no build**, so it never calls `community migrate`. There is nothing to undo
the schema with. Rolling back the other way, by redeploying an older
commit, does build and does run `community migrate`, which then applies
nothing, because migrations are forward-only.

Either route puts the old code back and leaves the schema where it is. A
rollback is therefore only safe while the older code tolerates the newer
schema.

There is one more shape to know: **a successful migrate followed by a
failed build**. The `&&` guards one direction only. It stops new code
reaching an old schema and does nothing about the reverse, so the
deployment aborts with the migration already applied and the previous
release still serving — and it stays that way until some later build
succeeds. The instinct is to roll back, and rolling back does nothing: the
old code is already what is serving. Fix the build and deploy forward.

### The installer, and the four things specific to here

Everything about the installer is the same here as on every other route and
is written once, in
[Quickstart § Run the installer](./quickstart.md#4-run-the-installer): the
preflight report that separates blockers from warnings, the three form
sections, the five steps, and the sealing that cannot be undone. Read that,
then come back for the four things specific to this route:

- **The board's address is not asked for.** `APP_URL` supplies it, and the
  preflight names the value it is using. Check that line — a preview URL
  left in `APP_URL` is a board whose password-reset links point at a
  deployment that will not exist next week.
- **The installer checks the schema rather than applying it.** Its first
  step confirms every table the board needs is there and stops with the
  names of any that are not; it never migrates. The build command already
  did that — `community migrate && forum-web build --at-root` — and a
  serverless function is the wrong place to try: several cold starts would
  contend for the same migration lock, and the function timeout bounds how
  long a migration is allowed to take. The step reads the table names out
  of the schema definitions, which are ordinary imported code, because the
  migration `.sql` files are not in the function: nothing imports them, so
  nothing traces them in, and nothing lists them in
  `outputFileTracingIncludes` either. If that step does report missing
  tables, run `community migrate` against the same database and reload —
  `MIGRATIONS_DIR` cannot help when the files are absent.
- **The installer takes the same session-level advisory lock migrations
  do**, so it needs `DIRECT_DATABASE_URL` for the same reason. Run against
  a pooler, it can report itself permanently in flight.
- **A warning about `TICK_SECRET` means what it says, not that the tick is
  unprotected.** The preflight checks that one variable by name, so a board
  configured the way Vercel Cron needs — `CRON_SECRET` and nothing else —
  is warned that the tick has no secret while the tick is in fact guarded.
  It is a warning rather than a blocker, so you can install straight past
  it. Setting `TICK_SECRET` as well, as [the environment](#the-environment-variable-by-variable)
  recommends, is the tidier answer and clears the check.

Sealing is recorded in the database rather than in the deployment, so it
survives every redeploy: `/install` answers 404 from then on, however many
times the project builds afterwards.

### Mail

`MAIL_DRIVER=http` posts the message as JSON to `MAIL_HTTP_ENDPOINT` with
`MAIL_HTTP_TOKEN` as a bearer token, and gives up after ten seconds, which
fits inside a function's timeout. Prefer it.

The body it posts is `{from, to, subject, text, html, reply_to}`, which is
**Resend's `POST /emails` contract exactly**. So Resend needs no adapter
and no configuration: the Deploy Button adds Resend alongside the database,
cache and blob store, and the integration sets `RESEND_API_KEY` and
`RESEND_EMAIL_DOMAIN`. The board reads both names, fills in Resend's
endpoint for you, sends from `noreply@` that domain, and needs nothing set
by hand. `MAIL_FROM` remains available to send from another address, and an
address set there always wins over the derived one. Either way the domain
has to be verified in Resend before Resend will send from it — that step is
between you and Resend, and no deploy can do it for you.

That bridge is one injected variable name mapped onto the generic pair, not
a provider baked into the board. The driver stays what it was: any provider
accepting a bearer token and that JSON shape works, by setting
`MAIL_HTTP_ENDPOINT` and `MAIL_HTTP_TOKEN`, which override
`RESEND_API_KEY`.

Only `RESEND_API_KEY` flips `MAIL_DRIVER` to `http` on its own, and only
with a sender beside it — `RESEND_EMAIL_DOMAIN` to derive one, or a
`MAIL_FROM` set by hand. Configuring the generic pair by hand leaves
`MAIL_DRIVER` alone, so set it to `http` yourself — a board that had those
two variables set and `MAIL_DRIVER` unset was not sending mail before, and
an upgrade is not the moment to start.

Set that pair **together**. Touching either half stands the bridge down
completely: the board will not combine `RESEND_API_KEY` with an endpoint
you supplied, nor point a token you supplied at Resend. That matters most
when moving away from Resend, where the integration has already set
`RESEND_API_KEY` and the obvious move is to change the endpoint and forget
the key — which would otherwise send a live Resend credential to the new
provider as its bearer token. Boot then fails naming `MAIL_HTTP_TOKEN`
rather than leaking it. Remove `RESEND_API_KEY` once you have moved.

`smtp` can work and is worse here. It opens a raw TCP connection on a port
the platform may not allow out: port **25 is refused outright by the
board's own environment rules on Vercel**, because serverless egress blocks
it and every message would hang until the function timed out; 465 is often
blocked; 587 with `MAIL_SMTP_SECURITY=starttls` is the one that usually
survives. A connection is also negotiated from scratch for every message,
because there is no long-lived process to pool one in — which makes each
send slow in a place where slow costs money.

### Blob or a bucket

Both work, and the board is the same either way. The difference is what
happens on the day you leave.

A **Vercel Blob store** is the cheapest thing to set up: attach one to the
project, and `BLOB_STORE_ID` appears by itself — see [how the Blob store
authenticates](#how-the-blob-store-authenticates). That replaces four
values that each had exactly one correct setting and each of which was a
typo away from a board that booted and then failed at the first upload. It
is what the one-click template in `templates/vercel` defaults to, and what
its Deploy Button provisions for you. Objects are written with **private** access — an object URL is not a
public link — and member content is served by the board, which is where
permissions are checked.

What you give up is portability. A Blob store is reachable only through
Vercel's API: there is no bucket to point `rclone` or `aws s3 sync` at, no
credential you can hand a second tool, and deleting the Vercel project
deletes the attachments with it. It is the one piece of genuinely
Vercel-shaped state this route has, and the whole of
[Leaving Vercel](#leaving-vercel) is written around getting it out.

An **S3-compatible bucket** is the portable one, and it stays the
documented default everywhere else in this project. You hold the bucket,
it outlives the Vercel project, and moving the board is a matter of
pointing the new deployment at the same credentials. Choose it if you
expect to move, or if you already have object storage.

You can change your mind later, in either direction, with a backup and a
restore — that is exactly what the exit below does.

### How the Blob store authenticates

A Blob store attached through the integration publishes **`BLOB_STORE_ID`**
and `BLOB_WEBHOOK_PUBLIC_KEY`. It does **not** publish a read-write token,
and that is deliberate rather than an omission: `@vercel/blob` resolves a
credential in this order, and the store id is the second half of the path it
prefers.

1. An explicitly passed `token` — a read-write token.
2. **OIDC**: the deployment's own identity token, taken from the
   `x-vercel-oidc-token` request header or `VERCEL_OIDC_TOKEN`, combined with
   a store id from `BLOB_STORE_ID`.
3. `BLOB_READ_WRITE_TOKEN` from the environment.
4. Otherwise it throws *No blob credentials found*.

So the board builds its store from `BLOB_STORE_ID` and **passes no token**,
which lets the SDK reach step 2. Passing a token — which this board used to
do on every call — takes step 1 and makes OIDC unreachable, which is why a
store attached through the integration could not be used at all before this.

Two consequences worth knowing:

- **A read-write token still works, and still wins where you mean it to.**
  Set `BLOB_READ_WRITE_TOKEN` and the board uses it. Set both, and the board
  prefers the store id — matching what the SDK itself would do if handed
  nothing — unless the token names a *different* store than `BLOB_STORE_ID`,
  in which case the token wins, because naming another store is a deliberate
  act and quietly writing to the linked one instead would be a data error.
- **Off the platform there is no identity to borrow.** A command run on your
  own machine — `community backup` against a Blob store is the case that
  matters — has no OIDC token, so it needs `BLOB_READ_WRITE_TOKEN`. Create
  one on the store under **Storage**. The deployment never needs it.
- **A token that names no store is refused at boot**, whether or not
  `BLOB_STORE_ID` is set beside it. A read-write token reads
  `vercel_blob_rw_<store>_<secret>` and the board takes the store out of the
  middle of it, so a truncated, stale or wrong-kind value has no store to
  name. The board will not quietly fall back to the store id and write
  somewhere the operator did not ask for, and it will not carry the bad value
  as far as the first upload: the environment refuses it by name, next to
  every other configuration error, and says the store id alone would have
  done. Remove the variable or fix it.

Two things here are **reasoned from the SDK's source and not confirmed
against a live deploy**, because nobody has run this yet:

- **Whether `VERCEL_OIDC_TOKEN` exists during a build.** The board is
  careful not to need it there: nothing in the environment rules asks for an
  OIDC token, and `community migrate` — which runs in the build command and
  validates the environment — touches no object storage. Selecting the
  driver needs `BLOB_STORE_ID`, which is an ordinary project variable
  present at build. A build should therefore not be able to fail on a
  credential that only exists at request time.
- **Whether OIDC can be turned off for a project.** If it can, a board would
  select `blob` from the store id and then fail on its first upload. That is
  a setting this board cannot see, so it cannot refuse at boot on account of
  it. What it does instead is refuse *clearly* at that first upload: the
  SDK's *No blob credentials found* is replaced with a message naming the
  store, saying that OIDC produced nothing — either off for the project, or
  running outside a deployment — and pointing at `BLOB_READ_WRITE_TOKEN` as
  the fix that works in both places.

### Why both database strings

A managed database hands out two connection strings for the same database,
and they are not interchangeable. Serving the board is pooler-safe: it
never holds a session open across statements, never uses `LISTEN`/`NOTIFY`,
and asks the driver for no named prepared statements — so `DATABASE_URL`
should be the pooler, because functions multiply connections faster than
anything else does.

Two things are not pooler-safe, and they are the two that take a
**session-level advisory lock**: migrations and the first-run installer. A
transaction-mode pooler hands the backend back the moment the statement
that took the lock commits, which breaks such a lock twice over — two
callers on different backends can each be told they hold it, and the lock
outlives the caller that took it. Both therefore use `DIRECT_DATABASE_URL`
when it is set and fall back to `DATABASE_URL` when it is not.

The rule is short: **if `DATABASE_URL` points at a pooler, set
`DIRECT_DATABASE_URL` as well**, in every environment that builds.
[Operations § Connection pooling](./operating.md#connection-pooling) has
the full account.

### What the board looks for, and in what order

The names an integration publishes are its own, and they change. So each
derivation searches an ordered list of candidates and takes the first that
is both **present** and **the right shape** — a `redis://` or `rediss://`
URL for the cache, a `postgres://` or `postgresql://` URL for the
database. A candidate of the wrong shape is passed over and then named in
the refusal, so a variable holding the wrong kind of value never reaches a
driver.

| Derived | Candidates, in order | Where that comes from |
|---|---|---|
| `REDIS_URL` | `KV_URL`, then `UPSTASH_REDIS_URL` | **`KV_URL` confirmed** against a real project with the Upstash integration linked. `UPSTASH_REDIS_URL` is **unconfirmed** — a fallback for Upstash's own naming outside the KV alias set, never observed, kept because it costs nothing. |
| `DIRECT_DATABASE_URL` | `DATABASE_URL_UNPOOLED`, then `POSTGRES_URL_NON_POOLING` | **Both confirmed** against a real project with Neon linked, and both unpooled. `DATABASE_URL_UNPOOLED` leads because it is the name that pairs with the `DATABASE_URL` the board serves from. |
| `CACHE_DRIVER=redis` | whatever `REDIS_URL` resolved to, derived or set | — |
| `FILESTORE_DRIVER=blob` | `BLOB_STORE_ID`, then `BLOB_READ_WRITE_TOKEN` | **Confirmed:** a linked store publishes `BLOB_STORE_ID` and `BLOB_WEBHOOK_PUBLIC_KEY`, and **no token** — the token is something you create. Either name is enough to select the driver; see [how the Blob store authenticates](#how-the-blob-store-authenticates). |

`REDIS_URL` is published by nothing: the Upstash set is `KV_URL`,
`KV_REST_API_URL`, `KV_REST_API_TOKEN` and `KV_REST_API_READ_ONLY_TOKEN`,
and `KV_URL` is the only one of them that speaks the Redis protocol.
`KV_REST_API_URL` is deliberately **not** a candidate: it is an HTTPS REST
endpoint, and a Redis client handed it fails at connect time in a way that
reads like a network fault rather than the configuration error it is.

`POSTGRES_URL` and `POSTGRES_PRISMA_URL` are deliberately not candidates
either. Both are **pooled**, and a transaction-mode pooler cannot hold the
session-level advisory lock migrations and the installer take — the whole
reason `DIRECT_DATABASE_URL` exists. `POSTGRES_URL_NO_SSL` is pooled as
well.

`BLOB_WEBHOOK_PUBLIC_KEY` is not a candidate. It is published beside the
store id, but it verifies webhooks the board does not receive, and it opens
nothing.

The lists live in `packages/core/src/env.ts` as
`VERCEL_REDIS_URL_SOURCES`, `VERCEL_DIRECT_DATABASE_URL_SOURCES`,
`VERCEL_BLOB_TOKEN_SOURCES` and `VERCEL_BLOB_STORE_MARKERS`. If your
provider publishes a name that is not on one of them, the shortest fix is
to set `REDIS_URL` or `DIRECT_DATABASE_URL` yourself — the derivation
stands aside for anything already set — and the durable one is to add the
name to the list.

### When a derivation cannot resolve

It refuses to boot, and names every variable it looked at. The board does
not fall back to `local` file storage or the `next` cache in place of a
derivation: uploads on a disk that is discarded with the instance, and a
cache each instance keeps to itself, are the outcomes the deploy form's
old questions existed to prevent.

| The refusal names | What happened | What to do |
|---|---|---|
| `CACHE_DRIVER` | No Redis connection string was found under any candidate name, and `CACHE_DRIVER` is unset. | Link a Redis store, or set `REDIS_URL` yourself. `CACHE_DRIVER=next` is available and honest — it says you accept a per-instance cache. |
| `REDIS_URL` | `CACHE_DRIVER=redis` is set explicitly and no connection string resolved. | The same, minus the `next` option: you asked for Redis. |
| `FILESTORE_DRIVER` | Neither `BLOB_STORE_ID` nor `BLOB_READ_WRITE_TOKEN` is present, and `FILESTORE_DRIVER` is unset. | Attach a Blob store, or set `FILESTORE_DRIVER=s3` and its four companions. |
| `DIRECT_DATABASE_URL` | A `DATABASE_URL` is set, but no unpooled string resolved. | Link the database, or set `DIRECT_DATABASE_URL` yourself — to the same value as `DATABASE_URL` if that one is already the direct string. |

A board with no `DATABASE_URL` at all is a fixture board, and no direct
string is asked of it.

These refusals are runtime rules. `next build` is exempt from them, as it
is from the production rules above, because a build serves no request —
but `community migrate` runs in the same build command and is not exempt,
so on Vercel a missing store stops the deploy rather than shipping a board
that will refuse on its first request.

## Configuring a project by hand

The Deploy Button is the supported route and the one the rest of this page
assumes. If you are importing an existing board repository into Vercel
yourself, this is what the template would otherwise have set for you.

The build command is the one setting that is not a default:

```sh
community migrate && forum-web build --at-root
```

`--at-root` materializes the board's app at the project root, so the build
artefact lands where Vercel reads it. Without it the app is materialized
two directories down and Vercel finds nothing to serve.

**The `&&` is the whole mechanism.** `community migrate` exits non-zero on
a failed migration, the build never starts, and the deployment fails
carrying the migration's own error instead of shipping new code onto an old
schema. There is deliberately no `forum-web build --migrate`: two commands
is what makes a failed deploy attributable to the step that actually
failed.

Applying the schema is always a separate step from starting the board.
Under Compose a one-shot `migrate` service does it and `web` waits for it
to exit 0. A platform that only builds and serves has nowhere to run a
one-shot job, so the same step goes in the build command, ahead of the
build — this is the supported arrangement, described in
[Operations § Migrations](./operating.md#migrations).

`community migrate` needs the database. `forum-web build` does not — Next
sets `NEXT_PHASE` during a production build and the board's environment
rules exempt that phase — but since they share one command line, the build
environment needs the database variables anyway.

You will also need `vercel.json` to declare the cron that drives
[the tick](#the-tick-replaces-the-worker), and the environment below.

What you have to bring, which the Deploy Button would otherwise provision:

| | |
|---|---|
| **A board repository** | A scaffolded board of your own, not a clone of the Meith repository — the same workspace [Quickstart § 2](./quickstart.md#2-create-your-board) creates. It depends on the published `@meith/web` and `@meith/cli` packages, which is what puts the `forum-web` and `community` commands in the build. |
| **A managed PostgreSQL** | With both connection strings: the transaction-mode pooler and the direct one. Both are needed, for the reason under [why both database strings](#why-both-database-strings). |
| **A managed Redis** | Reachable over TLS (`rediss://`). |
| **Somewhere to put uploads** | Either a Vercel Blob store, which costs nothing to set up, or an S3-compatible bucket and a key pair for it. The choice has consequences for [leaving](#leaving-vercel); read that first. |
| **A mail provider with an HTTP API** | SMTP is possible and worse here; see [mail](#mail). |
| **A domain** | Pointed at Vercel per their instructions. |

Read [what build-time migration means](#what-build-time-migration-means)
before the first preview build. Not after.

### The environment, variable by variable

This is the supported driver set for a board on functions, and it is the
one where no driver keeps anything inside the instance. The reasoning for
each is in [Scaling out](./scaling.md).

| Variable | Value | Why |
|---|---|---|
| `DATA_SOURCE` | `postgres` | `fixture` is a read-only sample board with no write side. |
| `QUEUE_DRIVER` | `postgres` | `memory` loses every queued job when the instance goes away, which is after almost every request. The environment refuses it in production. |
| `CACHE_DRIVER` | `redis` | `next` and `memory` cache inside the process. With instances created and destroyed constantly, a per-process cache is close to no cache. |
| `FILESTORE_DRIVER` | `blob` or `s3` | `local` writes to a disk no other instance can read and that is discarded with the instance. On Vercel the environment **refuses `local` outright** rather than losing uploads quietly. `blob` is a Vercel Blob store and needs no configuration beyond the token the store publishes; `s3` is any S3-compatible bucket and is the portable one. See [choosing between them](#blob-or-a-bucket). |
| `MAIL_DRIVER` | `http` | Reaches the provider over ordinary HTTPS on 443, the one outbound path a function can rely on. |

And the values those drivers need:

| Variable | What it is |
|---|---|
| `DATABASE_URL` | The **pooled** (transaction-mode) connection string. Every ordinary request goes through it. |
| `DIRECT_DATABASE_URL` | The **direct** (session-mode) string. Required here, not optional — see below. Derived from the database integration's own variables when you leave it unset; see [what the board looks for](#what-the-board-looks-for-and-in-what-order). |
| `REDIS_URL` | The cache. `rediss://` for TLS, which every managed provider requires. Derived from the cache integration's own variables when you leave it unset; see [what the board looks for](#what-the-board-looks-for-and-in-what-order). |
| `BLOB_STORE_ID` | Under `FILESTORE_DRIVER=blob`: the store's id, and on a linked store the whole credential. A Blob store attached to the project publishes it under exactly this name, so there is nothing to copy — see [how the Blob store authenticates](#how-the-blob-store-authenticates). |
| `BLOB_READ_WRITE_TOKEN` | The other way into the same store, created by you on the store itself. Needed only where there is no deployment identity to borrow — a `community backup` run on your own machine. |
| `S3_BUCKET`, `S3_REGION` | Under `FILESTORE_DRIVER=s3`: the bucket and its region. `auto` is the region for R2; the real one for AWS. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | The bucket's credentials. |
| `S3_ENDPOINT` | The API endpoint for a non-AWS bucket (R2, Spaces, MinIO). Omit for AWS S3. |
| `S3_PUBLIC_BASE_URL` | Where objects are *served* from, which is not always where the API lives — R2 serves from an `r2.dev` address or a custom domain, not from `S3_ENDPOINT`. Set it to that, or to a CDN in front of the bucket, or public URLs point somewhere a browser cannot fetch. |
| `MAIL_FROM` | The sender address. It must be at a domain your provider has verified for you. Optional where the provider publishes its sending domain: with `RESEND_API_KEY` and `RESEND_EMAIL_DOMAIN` both set, the board derives `noreply@` that domain. Set this to send from anything else — an address set here always wins over the derived one. |
| `RESEND_API_KEY` | Set by Resend's Vercel integration, which the Deploy Button adds. The board reads this name and needs neither of the next two. |
| `RESEND_EMAIL_DOMAIN` | Set by the same integration: the domain Resend sends from. The board builds the sender out of it, so a linked Resend needs no `MAIL_FROM`. A value that is not a bare hostname is refused at boot under this name. |
| `MAIL_HTTP_ENDPOINT`, `MAIL_HTTP_TOKEN` | Any other provider of the same shape. **Set them as a pair**, with `MAIL_DRIVER=http`: setting either one on its own stands the Resend bridge down entirely, so that a key issued for Resend is never presented to an endpoint someone else chose. Setting `MAIL_DRIVER` to anything but `http` stands it down as well, so a board that moved to SMTP never sends from Resend's domain through its new provider. |
| `APP_URL` | The board's public origin. Every link in every password-reset and confirmation e-mail is built from it, so it must be the real domain and not a preview URL. |
| `AUTH_SECRET` | Signs unsubscribe links in outgoing mail and seals two-factor secrets. **32 characters minimum**; the board refuses to boot on a shorter one. |
| `CRON_SECRET` | Guards `/api/system/tick`. Also 32 characters minimum. This is the name Vercel Cron can send — see [the tick](#the-tick-replaces-the-worker). |
| `TICK_SECRET` | The same guard under the other name. Strictly speaking `CRON_SECRET` alone protects the endpoint, but set this too: the installer's preflight looks only at `TICK_SECRET` and warns without it, and it is what any other scheduler — or the board you eventually move to — presents. Generate a separate value; it need not match. |

Generate each secret with `openssl rand -hex 32`.

On Vercel, all five drivers derive themselves, and setting one only
overrides the derivation: a `DATABASE_URL` implies `DATA_SOURCE=postgres`
and `QUEUE_DRIVER=postgres`; a Redis connection string implies
`CACHE_DRIVER=redis`; a Blob store's read-write token implies
`FILESTORE_DRIVER=blob`; and a `RESEND_API_KEY` with a sender beside it —
`RESEND_EMAIL_DOMAIN`, or a `MAIL_FROM` — implies `MAIL_DRIVER=http`. `DIRECT_DATABASE_URL` and `REDIS_URL`
derive too, from the variables the linked stores publish under their own
names. That is what leaves the template's Deploy Button asking for two
fields — `AUTH_SECRET` and `CRON_SECRET` — rather than seven.

Two rules hold over all of it:

- **The store derivations are scoped to this platform**, not to the mere
  presence of a variable. A board hosted anywhere else behaves exactly as
  it did before: an unset `CACHE_DRIVER` is still `next`, an unset
  `FILESTORE_DRIVER` is still `local`, and neither `DIRECT_DATABASE_URL`
  nor `REDIS_URL` acquires a value — even if some of the names below
  happen to be set in its environment. Only `DATA_SOURCE`, `QUEUE_DRIVER`
  and the Resend bridge derive everywhere, and those are unchanged.
- **Explicit configuration wins.** A derivation fires only where the
  variable is unset. Setting all five by hand, as the table above does,
  remains the clearest thing to do on a project you configure yourself,
  and a blank field on a deploy form arrives as an empty value, which
  counts as unset.

Neither the cache nor the object store falls back any more. Both used to:
`FILESTORE_DRIVER` fell back to `local`, which this platform already
refused outright, and `CACHE_DRIVER` fell back to `next`, which nothing
refused — the board cached inside each instance and served whatever that
instance last saw, for up to a minute, however many instances were
running. That quiet second failure is the reason the deploy form used to
ask for both. Now neither is asked for, and a derivation that cannot
resolve **refuses to boot** rather than choose one of them.

## Leaving Vercel

**This is the section that makes the rest of the page acceptable.** A board
is a community's record of itself, and a route that cannot be walked back
is not a route this project would document. Nothing above puts your board
somewhere you cannot get it out of, and here is the whole exit.

Everything durable is in PostgreSQL, in no proprietary format, with no
export request to file with anybody. Neon and Upstash hand out ordinary
Postgres and Redis connection strings that any host accepts.

**The uploads are the one thing you have to carry out deliberately**, and
how much care that takes depends on the choice made under
[blob or a bucket](#blob-or-a-bucket):

- On **`s3`**, the objects are already in a bucket you own. It outlives the
  Vercel project and you can copy it with any S3 tool you like.
- On **`blob`**, they are in a Vercel Blob store, and that *is*
  Vercel-shaped state. There is no bucket to sync, no credential to hand a
  second tool, and deleting the Vercel project deletes the attachments with
  it. The backup bundle is the only copy you will ever have.

Either way the command below produces one bundle holding both halves, and
the rest of this section is identical.

### 1. Take a bundle that carries both halves

From a checkout of your board repository, with the production environment
in front of it:

```sh
community backup --uploads include
```

That runs `pg_dump` over `DIRECT_DATABASE_URL` when it is set, and pulls
**every object out of the object store** into the same bundle.

The `--uploads include` flag is what forces that, and whether you need to
type it depends on the driver:

| Driver | Default | Why |
|---|---|---|
| `s3` | *skips* the bucket | A bucket has its own backup story and is yours already, so the bundle does not duplicate it. `--uploads include` is **not optional here** if the bundle is meant to stand alone. |
| `blob` | *includes* the store | A Blob store has no backup story you can drive yourself, so a bundle that skipped it would be a bundle that silently lost the attachments. |
| `local` | *includes* the directory | Same reasoning. |

Passing `--uploads include` is correct and harmless under all three, so
pass it and stop having to remember which one you are on.

**Read the last line the command prints.** `the database dump and the
uploads` means the objects are in the bundle. `the database dump, no
uploads` means they are not, and restoring that bundle gives a board whose
posts have broken images — which on `blob` is unrecoverable, because there
is nowhere else the objects still exist.

**And check the exit code.** An object whose key the board cannot use is
skipped rather than allowed to stop the run, so `community backup` can
exit **2**: the bundle was written, it names the objects it is missing in
its manifest, and on `blob` those objects are gone once the project is.
Read the list before you delete anything —
[When a bundle is incomplete](./operating.md#when-a-bundle-is-incomplete)
explains what to do about it.

This runs from anywhere; it does not have to run on Vercel. Put the
project's variables in front of it and it talks to Neon and to the Blob
store over the network:

```sh
DATABASE_URL=…            # the pooled string
DIRECT_DATABASE_URL=…     # the direct string, for the dump
FILESTORE_DRIVER=blob
BLOB_READ_WRITE_TOKEN=…   # create one on the store — see below
community backup --uploads include
```

That token is the one value here you make by hand. On the deployment the
board reaches the store with `BLOB_STORE_ID` and the deployment's OIDC
identity, and a command on your own machine has no such identity — so open
the store under **Storage**, create a read-write token, and use it for the
backup. [How the Blob store authenticates](#how-the-blob-store-authenticates)
has the whole of it.

Copy the bundle somewhere that is none of the four vendors.

### 2. Stand up the destination

Follow [Deploying by hand](./self-hosting.md) — a server, the compose file,
a `.env` and a proxy — or the [Quickstart](./quickstart.md) if you would
rather have the panel. Write the `.env`, and then **bring up Postgres
alone**:

```sh
docker compose up -d postgres
```

**Stop there.** Do not run `docker compose up -d --build` yet, and do not
open `/install`. The full `up` starts the `migrate` container, which
applies the schema and exits 0 — and `community restore` refuses a target
that already holds tables, saying so rather than writing over them. A
fresh Postgres container gives you the empty database a restore insists
on. This is the same sequence, for the same reason, as
[Disaster recovery § Restore the board](./disaster-recovery.md#3-restore-the-board);
follow that page if you want the commands spelled out against a running
stack.

You are restoring a board, not installing one.

### 3. Restore into it

```sh
RESTORE_DATABASE_URL=postgres://… community restore <bundle.tar.gz>
```

`community restore` refuses to run without `RESTORE_DATABASE_URL` and
writes only there, so a restore can never be aimed at a live board by
accident. It puts the uploads back where the **destination's** own
`FILESTORE_DRIVER` says they go, whatever they came from — the local volume
on a Compose deployment, a bucket if you set `FILESTORE_DRIVER=s3` and the
`S3_*` values, or `--uploads-dir` to write them to a directory you name.
Objects taken out of a Blob store go into a bucket or onto a disk with no
conversion step: the keys are the same on either side.

It applies any migrations the bundle predates on its way through, so there
is no separate migration step to remember. Bring up the rest of the stack,
then verify sign-in, recent threads, uploads, mail and scheduled tasks
**before** you move DNS. [Disaster recovery](./disaster-recovery.md) is the
complete runbook and applies unchanged; leaving a platform is the same
operation as recovering from one, minus the urgency.

### 4. Turn the tick back into a worker

The destination has a `worker` container, so drop `vercel.json`'s cron
entry and let it do what Vercel's scheduler was standing in for. It ticks
every 60 seconds without being asked, which is the cadence the daily-tick
caveat above was costing you.

That container presents `TICK_SECRET`, not `CRON_SECRET` — so make sure
`TICK_SECRET` is set in the destination's `.env`, carrying over the value
you were already advised to set on Vercel. `CRON_SECRET` stops being needed
the moment the cron job is gone.

That is the whole move: a dump, the objects, and a guide that was already
written. **The board stays yours** — which is the only condition under
which running it on somebody else's functions is a reasonable thing to do.

One caveat, stated plainly because it is the only part of this route that
does not survive neglect: on `blob`, that bundle is the sole copy of the
attachments. A bucket sits there whether or not you ever think about it
again; a Blob store goes when the project goes. If you are on `blob`, take
a backup on a schedule rather than on the day you leave — see
[Disaster recovery](./disaster-recovery.md#4-the-uploads-when-they-lived-elsewhere)
— or move to `s3` while the board is still up, which is the same backup and
restore run against a destination that keeps the objects.

## When it goes wrong

| What you see | What it is |
|---|---|
| The build fails on `maxDuration` | Fluid Compute is off and the plan caps functions below 300 seconds — see [above](#maxduration-is-checked-at-build-time). |
| The build fails inside `community migrate` | The migration itself failed, and the `&&` stopped the build on purpose. Its error is in the build log, and nothing was deployed. |
| `community migrate` hangs with no output | It is waiting for the advisory lock, or `DIRECT_DATABASE_URL` names the pooler rather than the direct string. See [Operations](./operating.md#migration-does-not-complete). |
| The board refuses to boot with a `FILESTORE_DRIVER` error | Either `local` was set explicitly, which Vercel refuses outright, or nothing published an object store to derive from — [when a derivation cannot resolve](#when-a-derivation-cannot-resolve). The message names what it looked at. |
| The build fails naming `CACHE_DRIVER` or `REDIS_URL` | No Redis connection string resolved: no store is linked, it was linked after this build's environment was read, or it publishes a name not on the candidate list. `community migrate` runs in the build command and applies the same rules the running board does. |
| The build fails naming `DIRECT_DATABASE_URL` | `DATABASE_URL` is set but no unpooled string was published beside it. Set `DIRECT_DATABASE_URL` — to the same value, if `DATABASE_URL` is already the direct string. |
| The build fails naming `BLOB_STORE_ID` and `BLOB_READ_WRITE_TOKEN` | `FILESTORE_DRIVER=blob` is set but no Blob store is attached to the project, or it was attached after this build's environment was read. Attach one under **Storage**, then redeploy. |
| The board boots, then an upload fails saying the store was reached with no usable credential | The board is on the OIDC path and the platform supplied no identity token — OIDC is off for the project, or this is running off the platform, as a local `community backup` is. Create a read-write token on the store and set `BLOB_READ_WRITE_TOKEN`. |
| A refusal names a variable your store does publish, under another name | The candidate list does not have that name. Set `REDIS_URL` or `DIRECT_DATABASE_URL` directly — an explicit value stands the derivation down — and [add the name to the list](#what-the-board-looks-for-and-in-what-order). |
| The board boots but sends no mail | No mail token is set, so `MAIL_DRIVER` fell back to `log` and every message goes to the build log. Add Resend to the project, or set `MAIL_HTTP_ENDPOINT` and `MAIL_HTTP_TOKEN`. A sender is needed too: `RESEND_EMAIL_DOMAIN` derives one, or set `MAIL_FROM` by hand. |
| Mail is rejected with a sender error | The sender is at a domain the provider has not verified — whether it came from `MAIL_FROM` or was derived from `RESEND_EMAIL_DOMAIN`. Verify it in the provider's dashboard; nothing on this side can work around it. |
| Production migrated and nobody deployed anything | A preview or branch build did it, because the database variables reach every environment — [scope them to Production](#every-build-migrates-previews-included). The migration has applied and does not come back off. |
| A rollback did not fix the schema | It never could. Rollback runs no build and so runs no migration — [above](#rollback-does-not-un-migrate). Deploy forward. |
| Nothing happens on a schedule | The cron job is not reaching `/api/system/tick`, or the secret is wrong — a wrong secret gets a plain `404`, because the endpoint does not admit it exists. Check `/admin/system`. |
| Notifications arrive a day late | The tick is running at the Hobby cadence — [the cadence caveat](#the-cadence-caveat-stated-plainly). |
| Uploads 404 from the browser | On `s3`, `S3_PUBLIC_BASE_URL` is unset or wrong — R2 does not serve objects from the API endpoint `S3_ENDPOINT` names. On `blob` this does not arise: the board serves the bytes itself. |
| Mail is queued and never sent | Either the tick is not running — `queue.drain` is what sends it — or `MAIL_DRIVER=smtp` is hanging on a blocked port. Use `http`. |
| An upload fails on a large file | The function's memory limit, not the store. Lower the board's attachment limit. |
| `community restore` says the target already holds tables | The destination's `migrate` container has already run, so the database is not empty. Bring up Postgres alone into a fresh volume — [leaving, step 2](#2-stand-up-the-destination). Nothing was written; it refused before touching anything. |

[Operations § Troubleshooting](./operating.md#troubleshooting) covers the
failures that are about the board rather than the platform.

## Next

| You want to | Read |
|---|---|
| Understand the driver set in depth | [Scaling out](./scaling.md) |
| Set up metrics and alerting | [Monitoring & alerting](./monitoring.md) |
| Move between versions | [Upgrading a board](./upgrading.md) |
| Run the board day to day | [Operations](./operating.md) |
| Move a MyBB or phpBB forum here | [Migrating from MyBB or phpBB](./migrating.md) |
| Leave for a server | [Deploying by hand](./self-hosting.md) |
