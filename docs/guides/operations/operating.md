# Operations

This guide is for the person responsible for a running Meith server. It covers routine checks, configuration, maintenance, backup, web push, the cookies and security headers the board serves, and common failures.

Installing a board? Use the [Quickstart](../../getting-started/deployment/coolify.md) or [Deploying by hand](../../getting-started/deployment/docker-compose.md). Community administration belongs in the [Organiser guide](../community/organiser-guide.md).

## Services

The supported Compose deployment runs:

| Service | Purpose | Expected state |
|---|---|---|
| `postgres` | Board data | Running and healthy |
| `migrate` | Schema migrations | Exited successfully |
| `web` | Pages and APIs | Running |
| `worker` | Scheduled and queued work | Running |

PostgreSQL and uploads use persistent volumes. A database-only backup does not include uploaded files.

## Migrations

Applying the schema is always a separate step from starting the board. Under Compose the one-shot `migrate` service does it and `web` waits for that service to exit 0. Where the deployment has no place to run a one-shot job — a platform that only builds and serves — the same step belongs in the build command, ahead of the build:

```sh
meith migrate && forum-web build
```

`meith migrate` applies every migration the installed release has that the board does not, reports how many it applied, and exits 0 having done nothing when the schema is already current. It needs no build output and no running board, so either end of a deploy is a valid place for it. A failure exits non-zero, which is what stops the `&&` and fails the deployment instead of serving new code against an old schema.

Once the board is up, an admin can apply pending **plugin** migrations from **Admin → System** (**Version & migrations**) after a re-entered password — the setup a newly installed plugin needs, which the Compose `migrate` service (it runs `meith migrate`, core only) does not. Core schema migrations are not run from the panel: they belong to the deploy step, run against a direct connection before `web` serves, which is what keeps it from ever serving against an older schema.

### Two migrations at once

The runner takes a session-level PostgreSQL advisory lock on a fixed key, holds it for the whole run, and releases it when the run ends — including when the run fails. Overlapping migrations therefore queue rather than race: the second waits for the first to finish, then finds the schema current and applies nothing. Two builds triggered close together cannot apply the same core migration twice.

The lock covers the core migration run and nothing after it. `meith upgrade` applies each installed plugin's migrations once `runMigrations()` has returned, which is to say once the lock is already released, so two upgrades running at the same instant are serialised through the core schema but not through the plugins'. Run one upgrade at a time.

Nothing has to clean up after a crash. PostgreSQL drops a session-level lock when the connection goes, so a process killed mid-run leaves the lock released and the next attempt proceeds. The lock is held in the database rather than by the board, which is what makes it cover migrations started from different machines against the same database.

### Which connection migrations use

`meith migrate` and `meith backup` connect over `DIRECT_DATABASE_URL` when it is set and over `DATABASE_URL` when it is not. `meith restore` is the exception in the other direction: it writes to `RESTORE_DATABASE_URL` and refuses to run without it, so a restore can never be aimed at the live board by accident. Everything else — web, worker, the tick — always uses `DATABASE_URL`.

## Connection pooling

A managed database (Neon, Supabase and their kind) hands out two connection strings for the same database: a transaction-mode pooler and a direct one. They are not interchangeable, and a board wants both.

Use the **pooler** string for `DATABASE_URL`. Each web process opens up to `DATABASE_POOL_MAX` connections and the count multiplies with instances, so a board on the direct string works in testing and begins refusing connections under the first real traffic, reporting an error that names the database rather than the cause.

Use the **direct** string for `DIRECT_DATABASE_URL`. The reason is the advisory lock, and it is the only reason. `pg_advisory_lock` arrives as its own implicit transaction, so a transaction-mode pooler considers the backend free the moment it returns: the lock is left on a connection the pooler then hands to somebody else, the migration runs with nothing serialising it, and the `pg_advisory_unlock` at the end reaches an arbitrary backend, finds no lock there, and fails silently — the runner sets `onnotice` to a no-op, so the warning PostgreSQL raises never reaches a log.

The migrations themselves are not the problem. Every pending migration runs inside one transaction, and pinning a single backend for a transaction's whole duration is what transaction mode *is*; the only statements outside it create a schema and a table `IF NOT EXISTS`. So do not reason from the size of a release — "this one only adds a column, a pooler is fine for it" is the wrong conclusion. The lock is taken on every run, and every run needs the direct string. Setting both variables gives each job the connection it needs, with no further configuration.

A PostgreSQL you run yourself, with a fixed number of processes in front of it, has no such split and needs no pooler: leave `DIRECT_DATABASE_URL` unset and migrations use `DATABASE_URL` like everything else.

## Routine checks

After deployment changes and during regular monitoring, run:

```sh
docker compose ps
docker compose logs --since 1h web worker
```

Confirm that PostgreSQL is healthy, migration exited with code 0, web is not producing repeated errors, worker ticks continue, disk has room, and the public HTTPS URL works.

Pages can still load while a stopped worker leaves mail and scheduled work stalled. Monitor both services.

`/api/ready` answers the same question a script can act on: it fails once the database is unreachable or the scheduler has stopped entirely, and drives the `web` and `worker` container healthchecks (`docker compose ps`). See [Monitoring & alerting](./monitoring.md) for the optional metrics endpoint, what to alert on, and how to ship logs.

## Configuration

Environment variables hold deployment drivers, credentials, and values needed before the database is available. Board settings hold values administrators can change at runtime. Environment values win where both sources are supported.

Validate the environment:

```sh
docker compose run --rm web meith env:check
```

Inspect settings:

```sh
docker compose run --rm web meith settings:list
docker compose run --rm web meith settings:get <key>
```

Set a value from the terminal only when the admin interface is unavailable:

```sh
docker compose run --rm web meith settings:set <key> <value>
```

The standard deployment requires a PostgreSQL password, `AUTH_SECRET`, `TICK_SECRET`, and the public `APP_URL`. Generate secrets independently, protect the `.env` file, and never commit it.

`TICK_SECRET` protects `/api/system/tick`, the HTTP form of the worker's tick. A deployment with no long-lived worker process drives that endpoint from a cron scheduler instead, and `CRON_SECRET` is the second name the same endpoint accepts it under, for a scheduler that can only send `Authorization: Bearer` under that name. Either variable on its own protects the endpoint, and production refuses to boot with neither — see [Monitoring](./monitoring.md#driving-the-tick-over-http) for the request and response contract.

Use `meith --help` for the exact commands supported by the installed release.

## The operator CLI

`meith` is the operator CLI, and every maintenance command on this page is one of its subcommands. How you reach it depends on the deployment:

| Deployment | Invocation |
|---|---|
| Compose, into the running board | `docker compose exec web meith <command>` |
| Compose, as a fresh one-shot container | `docker compose run --rm web meith <command>` |
| A local checkout of the board | `npm run meith -- <command>` |
| A platform that only builds and serves | `meith <command>`, from a checkout of the board repository with the production environment in front of it — see [Running on Vercel](../../getting-started/deployment/vercel.md) |

`meith` is on `PATH` inside the board image, so `exec`-ing into the running `web` container is the quick way — nothing to build, and it shares the board the container is already serving. `run --rm` starts a fresh container instead, which is what you want when `web` is not up (a broken migration, say); `--rm` stops those accumulating, and `-T` is needed when the command reads standard input, as creating a user does under [Account recovery](#account-recovery). On Coolify, both run from the resource's **Terminal** with no SSH — see [Running commands on Coolify](../../getting-started/deployment/coolify.md#running-commands-the-cli-without-ssh).

There is no container to run a command inside on the second route, which is why it runs from a checkout instead; the one command that does not wait for an operator is `meith migrate`, which belongs in the build command ahead of the build — see [Migrations](#migrations).

The CLI reaches the database directly, so it works when the board's pages do not — which is what makes it the route back in when administrator access is lost. Pending **plugin** migrations can also be applied from the panel, under **Admin → System** (**Version & migrations**), so a newly installed plugin's setup needs no shell; the core schema `migrate`, `upgrade`, `backup` and `restore` stay CLI-only.

`meith --help` lists what the installed release actually has. A command documented here that is missing there means the running image is older than the page — see [A documented command is unavailable](#a-documented-command-is-unavailable).

## Mail

The worker sends queued mail, so web and worker need the same mail configuration. The standard Compose file forwards the supported HTTP and SMTP environment values.

After a change:

1. recreate web and worker;
2. run `meith env:check`;
3. trigger a real board email;
4. inspect worker logs and the receiving mailbox.

A successful network connection is not proof of delivery.

### Outbound address policy

Mail leaves the server, so a mail endpoint or SMTP host is an outbound destination the board treats as a security boundary, not ordinary configuration. Before it connects, the board resolves the host and refuses any address in a private, loopback, link-local (including the `169.254.0.0/16` cloud-metadata range), unique-local, or reserved range; the resolved address is pinned for the connection, so a name that answers with a public address on one lookup and a private one on the next cannot slip through. An HTTP endpoint must additionally be an `https://` URL and carry no embedded credentials. When a provider returns an error, the board records a bounded diagnostic in its own log and surfaces only the status to the admin — an upstream response body is never echoed back through the mail-test result.

A relay on the same machine or a private network is the one legitimate internal destination. Set `MAIL_ALLOW_PRIVATE_HOSTS=true` to allow it; outside production the guard is relaxed already, so local development needs nothing. Prefer a genuinely reachable public provider to widening this in production.

Every guarded request also runs against a wall-clock deadline, not a socket-inactivity timeout: an endpoint that drips a byte before each idle interval cannot hold a worker open forever, because the whole request — connection, request and response — is torn down once the deadline passes regardless of trickle. The response body the board reads is bounded too; an endpoint that streams without end is cut off rather than followed. Where the caller can be cancelled — the scheduled task that posts web-push notifications carries the tick's own budget through to each request — an abort tears the in-flight request down at once instead of waiting for the deadline.

Two other requests the board makes on visitors' behalf cross the same boundary and are held to the same resolve-and-pin policy: webhook delivery (`WEBHOOK_ALLOW_PRIVATE_HOSTS`) and the web-push notification the worker posts to a subscriber's push service (`PUSH_ALLOW_PRIVATE_HOSTS`). A push endpoint comes from a member's own browser, so it is checked when the subscription is stored and again, against its freshly resolved address, every time a notification is sent — a name that later resolves inside your network cannot be used to reach an internal service. The marketplace catalog URL is deliberately exempt: it is an admin-only setting, in the same trust tier as the mail and OAuth destinations, and its handling is described in [the marketplace guide](../../customization/marketplace.md#the-feed-url-is-an-admin-trusted-setting).

## Scheduled tasks

```sh
docker compose run --rm web meith task:list
docker compose run --rm web meith task:run
docker compose run --rm web meith task:run <task-id>
```

Manual execution follows the same due and claim rules as the worker. Use it for diagnosis, not as a permanent scheduler.

## Backup

Create a restorable bundle with:

```sh
mkdir -p backups
docker compose run --rm --no-deps --user "$(id -u):$(id -g)" -v "$PWD/backups":/backup web \
  meith backup --out /backup/board.tar.gz
```

`meith backup --help` prints the flags the installed release actually has — include uploads when they use the local volume, and copy at least one version off the server.

**Neither the `mkdir` nor the `--user` is optional**, and they are needed for the same reason `board:eject` needs them (see [the marketplace](../../customization/marketplace.md#moving-to-a-custom-board)). The image runs as a fixed, non-root account — `nextjs`, uid 1001 — which owns nothing on your host, so it can only write into a directory that account can already write to. Creating `backups` yourself first means it belongs to you rather than being auto-created root-owned by Docker; `--user "$(id -u):$(id -g)"` then makes the account doing the writing the account that owns the directory. Without them the run ends in `EACCES: permission denied`, saying which directory needs write access and pointing back here.

**It ends there before dumping anything.** `backup` claims its destination as its first act — creating the file, empty and mode `0600`, before it connects to the database — so a path it cannot write is refused in under a second rather than after a dump that may take minutes. That also means two backups aimed at the same path cannot both run: the second is refused immediately rather than dumping and then losing. The command **never writes over an existing file**; if a previous run was killed part-way through it can leave an empty or truncated file at the path it had claimed, and the next run refuses that path by name. Such a file is not a backup and is safe to delete.

Reading a bundle back needs neither addition: files inside the image are world-readable, so [Restore](#restore) and [disaster recovery](./disaster-recovery.md) mount `/backup` and read from it as they are.

A useful policy records frequency, retention, off-server location, access ownership, and the last successful restore rehearsal. A backup is not proven until it restores into an empty target.

### A ring of bundles

`--out` names one file and refuses to write over anything. A scheduled backup wants the other shape, and `--dir` is it:

```sh
meith backup --dir /backups --keep 7
```

Each run writes a fresh bundle into the directory, named for the moment it started (`meith-backup-2026-09-01T02-00-00Z.tar.gz`), and then — only after the new bundle is safely written — deletes the oldest bundles beyond the newest `--keep` (7 when the flag is not given). The order is the point: a run that fails never prunes, so a week of failed backups leaves the last good bundles untouched rather than eating them one night at a time. Pruning matches the bundle name pattern exactly and touches nothing else in the directory.

Retention is also the disk knob. A bundle carries the uploads when they live on the local volume, so on a small server the ring's size is roughly `--keep` times the board's data; if the disk fills, lower the count rather than skipping uploads.

This is the shape [the Coolify guide](../../getting-started/deployment/coolify.md#6-set-up-backups) schedules: its compose file mounts a named `backups` volume at `/backups` so the ring survives redeploys.

### Shipping bundles off the server

A ring on the server protects against a bad upgrade or a deleted thread, not against losing the server. Set four variables and every backup also ships its bundle to an S3-compatible bucket, pruned there to the same `--keep`:

```sh
BACKUP_S3_BUCKET=board-backups
BACKUP_S3_REGION=auto
BACKUP_S3_ACCESS_KEY_ID=…
BACKUP_S3_SECRET_ACCESS_KEY=…
```

`BACKUP_S3_ENDPOINT` points it at anything S3-compatible — R2, MinIO, Spaces, Backblaze B2 — the same way `S3_ENDPOINT` does for the filestore, and `BACKUP_S3_PREFIX` shares one bucket between boards. All four required values must be set together: a partial set fails the backup run, loudly, and never affects the board itself. Use a bucket of its own — never the bucket the uploads live in, or a backup of the uploads sits where losing the uploads loses it too. Give the credential only what it needs: write and list on that bucket alone.

Two commands close the loop:

```sh
meith backup:list --dir /backups
meith backup:fetch meith-backup-2026-09-01T02-00-00Z.tar.gz
```

`backup:list` prints the local ring and what the bucket actually holds — run it after the first shipped backup, because an upload nobody has listed is a hope, not an off-site copy. `backup:fetch` downloads one bundle back, which is how a [disaster recovery](./disaster-recovery.md) on a fresh machine reaches its backup without `scp`: set the same `BACKUP_S3_*` values there and fetch.

### When a bundle is incomplete

On `s3` and `blob` the uploads are pulled object by object out of the store, and an object whose key the board cannot use — one that would escape the staging directory, one holding a `.` or `..` segment, an empty segment, surrounding whitespace, or a control character — cannot be written into the bundle. Such a key is not something the board itself produces; it arrives when something else writes into the same bucket or store, or when a key is mangled in a migration between them.

`meith backup` **skips that object and finishes the run**. The alternative — stopping — was the old behaviour, and it meant one malformed key out of ten thousand produced no backup at all, on the day the operator most needed one. A bundle missing one attachment is worth having; a bundle that does not exist is not.

Skipping quietly would be its own failure, so a run that skips anything reports it three times over, and each one is aimed at a different reader:

| Where | Who reads it | Why it alone is not enough |
|---|---|---|
| A warning naming each key as it is skipped, and a summary before the command exits | Whoever is watching the run | Scrolls away, and nobody is watching a nightly job |
| `skippedKeys` in the bundle's `manifest.json`, which `restore` prints back | Whoever restores, possibly a different person months later | Discovered at restore time — too late to fetch the object another way |
| **Exit code 2**, after the bundle has been written | A scheduler, a CI job, a `&&` in a shell script | Says nothing about *which* objects, and is gone once the run is over |

The exit codes are: **0** the bundle is complete; **2** the bundle was written and is missing objects it names; anything else the backup failed and there is no bundle. A job that treats non-zero as failure will therefore raise this run, which is the intent — but a `2` is not a reason to discard the bundle, because it is the most complete copy that can be made. Do not retry it expecting a different result either: the keys are unusable in the store, so the next run skips exactly the same objects.

The repair is in the store, not in the backup. Rename or remove the offending objects — the manifest names them — and the next run carries them.

## Restore

Restore only into a new, empty database. Stop traffic and review the installed command first:

```sh
docker compose run --rm web meith restore --help
```

After restore, apply migrations for the selected release, start web and worker, and verify sign-in, recent threads, uploads, mail, and scheduled tasks before changing DNS. See [Disaster recovery](./disaster-recovery.md) for the complete runbook. A bundle that lives at the off-site destination comes back with [`meith backup:fetch`](#shipping-bundles-off-the-server) first; `restore` itself only reads local files.

A bundle whose manifest records skipped objects — see [When a bundle is incomplete](#when-a-bundle-is-incomplete) — restores normally, and the restore names those objects as it finishes. Posts referring to them have broken images, and no other copy of them exists; the restore still exits 0, because the restore did everything it was given.

## Upgrade

Follow [Upgrading a board](./upgrading.md). Do not replace a container image without following that release's migration path.

At minimum:

1. read release notes and upgrade instructions;
2. copy a fresh backup off the server;
3. select the intended release;
4. run its upgrade procedure;
5. confirm migration, web, and worker states;
6. test the board.

## Account recovery

Create a user with a password on standard input:

```sh
printf '%s' '<password>' | docker compose run --rm -T web meith user:create --username <name> --email <address>
```

Promote a user:

```sh
docker compose run --rm web meith user:promote --user <id-or-username> --group <key-or-id>
```

Clear a lost second factor and end that user's sessions:

```sh
docker compose run --rm web meith user:2fa-clear --user <id-or-username>
```

Record who requested any recovery change.

## Search maintenance

Rebuild missing full-text records with the resumable command:

```sh
docker compose run --rm web meith search:reindex
```

Use it after an import or when diagnostics show posts without search data. It is safe to repeat.

## Import a legacy board

The importer moves a MyBB or phpBB board into Meith, and is resumable:
interrupt it, run the same command again, and it continues from its
cursors. The full procedure — what to check first, per-source coverage,
what to do after it finishes, and troubleshooting — is
[Migrating from MyBB or phpBB](../migrating.md). Quick reference for
somebody who has already read it:

```sh
docker compose run --rm web meith import --help
IMPORT_SOURCE_PASSWORD=… meith import --source mybb --host db.old --user reader --database mybb --uploads-dir /mnt/old-board/uploads
IMPORT_SOURCE_PASSWORD=… meith import --source phpbb --host db.old --user reader --database phpbb --prefix phpbb_ --uploads-dir /mnt/old-board
```

`--source` selects the source forum software (`mybb` is the default; `phpbb` targets phpBB 3.1 or later). The database password comes from `IMPORT_SOURCE_PASSWORD` (`MYBB_PASSWORD` is still accepted) rather than a flag, so it never appears in shell history or `ps`. `--uploads-dir` copies attachments and avatars across as files; without it, attachment rows import marked failed and avatars are skipped, until the same command is run again with the flag.

Back up the source, rehearse against a non-production board, and run the importer with a read-only database account. After it finishes, run `meith task:run counters.reconcile`, reindex search, and verify users, forums, threads, attachments, permissions, and legacy URLs — [Migrating from MyBB or phpBB](../migrating.md#after-the-import) has the full checklist.

## Plugins

Installing a manifest-eligible plugin — one that ships a zero-argument `plugin` export, see
[Writing a plugin](../../customization/plugins.md#writing-a-plugin) — is a change to the sources your
image is built from, not something run against the deployed image. On your own board — scaffolded by
`create-meith`, or graduated out of the stock image by `board:eject` — it is one command, which
installs the package and registers it:

```sh
meith plugin:add @meith/plugin-dues
```

In a checkout of *this* repository, where the board is one workspace among many, the package is added
by hand with `pnpm add @meith/plugin-dues --filter @meith/web` (and `--filter @meith/board-stock` for
the stock board) first, then `meith plugin:add @meith/plugin-dues` records it across both. See
[Installing plugins and themes](../../customization/installing.md) for the board admin's walkthrough.

`plugin:add` and `plugin:remove` edit `board.plugins.json` and regenerate
`meith.plugins.ts`; commit both and rebuild and redeploy the image for the change to take
effect. A plugin that cannot yet satisfy the manifest's export convention stays a line in
`meith.plugins.ts` you write by hand, exactly as before.

Before removing plugin code, purge its owned data through the lifecycle hook — this one *does*
run against the deployed board, because it needs the live database:

```sh
docker compose run --rm web meith plugin:purge <key> --yes
```

Removing files first can leave data without the code required to clean it up.

## Web push

A pushed notification reaches a member who does not have the board open —
the operating system's own notification, raised on a phone or laptop
doing something else. The same machinery makes the board installable: a
board that can push and sit on a home screen is treated as an
application by the browsers, and on iOS it must be installed before it
may push at all. Push is off until an operator turns it on, and then off
for every member until they turn it on themselves, per browser. There is
no way to be pushed at by accident.

### What it costs a member's privacy

A push travels from the board to **a push service run by the browser's
maker** — Google for Chrome, Mozilla for Firefox, Apple for Safari — and
from there to the device; there is no version of the standard where a
board reaches a sleeping phone by itself. The push service learns that
this board sent something to this endpoint, and when — nothing about
what it said (the payload is encrypted end to end,
[RFC 8291](https://www.rfc-editor.org/rfc/rfc8291), to a key only the
browser holds) and nothing about who the member is (an endpoint is an
opaque URL the browser minted). The board tells each member this on the
preferences screen before they subscribe; repeat it in your privacy
policy if your members would want it there.

### Turning it on

1. **Generate a VAPID key pair**
   ([RFC 8292](https://www.rfc-editor.org/rfc/rfc8292)) — the public
   half every browser stores when it subscribes, the private half signs
   every send:

   ```sh
   docker compose run --rm web meith push:keys           # prints a pair to paste in
   docker compose run --rm web meith push:keys --save    # generates and stores it
   ```

   > [!WARNING]
   > Replacing a key pair that is already in use kills every stored
   > subscription: the browsers hold the old public key and the push
   > services will refuse the new signature. Each member's browser
   > resubscribes on its next visit to the preferences screen, and until
   > then they are pushed nothing. Generate once.

2. **Fill in the settings** at `/admin/settings?group=push`:

   | Setting | What it does |
   |---|---|
   | **Offer web push** | Off by default. On, members get a subscribe button on `/notifications/preferences` and a push column beside the e-mail one. |
   | **VAPID public key** | The half every browser stores. |
   | **VAPID private key** | The half that signs. Stored on the board, like the SMTP password. |
   | **Contact for the push service** | A `mailto:` or `https:` address a push service can use to reach you. Left empty, the board sends the mail-from address, and failing that its own https address. With none of the three, push stays off, and the settings screen says so. |

3. **Serve the board over HTTPS.** A service worker will not register
   over plain HTTP, and without one there is no push and no install.
   `localhost` is exempt, which is why development works without a
   certificate.

### What a member does

On `/notifications/preferences`, a member subscribes the browser they
are holding, ticks a push box per notification kind (independent of the
e-mail box beside it), and can remove the subscription again. Every
browser is subscribed separately — the subscription belongs to the
browser, the per-kind preferences to the account. The subscribe button
is the one part of the board that needs JavaScript to be useful, because
a page cannot ask a browser for a push subscription in a form post;
everything else on the screen is an ordinary no-JS form.

On iPhone and iPad, Safari pushes only to a board that has been **added
to the home screen**. Until then the subscribe button is refused by the
browser; the board reports the refusal rather than pretending it worked,
though Safari does not say the home-screen rule was the reason.

### How a push is sent

The path is the one notification mail already takes, with a second
handler at the end: `raise()` writes the notification, an outbox row is
written only when somebody wants the mail or the push, and the tick
relays it to the `notifications.email` and `notifications.push` queue
jobs — separate jobs, so a push service being down does not hold up the
mail. A coalesced notification pushes nothing, on the same rule as mail;
`push_sent_at` guards against a double send, exactly as `email_sent_at`
does. Failures retry through the queue, and a push service answering
`404` or `410` means the browser is gone for good — that subscription is
pruned. The payload carries the notification's rendered subject and
body in the member's own language, its id, the link it points at, and
the member's unread count for the app badge — capped well under the 4 KB
a push service will carry.

One member's devices are pushed a few at a time rather than strictly one
after another, so a single slow or hostile push service cannot hold up
the rest of the batch; each request still carries the deadline, response
cap and abort described under [the outbound address
policy](#outbound-address-policy). A member may register up to twenty
push subscriptions; a browser re-subscribing an endpoint it already holds
replaces that one rather than counting against the cap, but a twenty-first
distinct browser is refused until one is removed.

### The service worker and the manifest

`public/sw.js` shows a notification when one is pushed and opens or
focuses the right page when one is clicked, exactly as before. A click
deep-links to the notification's own target and falls back to
`/notifications`; off-origin links are refused.

Its only other job is a navigation fallback for an installed board that
opens with no connection. The `fetch` handler intercepts navigation
requests alone (`request.mode === 'navigate'`) and always tries the
network first; it only steps in when that request fails outright,
serving a precached, static `/offline` page instead of the browser's own
error screen. Nothing else is cached or intercepted — the board's actual
pages, its API responses, and its assets all still go straight to the
network on every request. That restraint is deliberate: a cached page
served to a signed-in member is a page with somebody else's name in the
header, so the fallback carries no session state at all — the board's
name, a short "you're offline" message, and a link that retries once the
connection is back. `/offline` has no data dependency of its own for the
same reason: it is a static route, styled with its own inlined copy of
the default design tokens rather than the board's stylesheet, so it
renders correctly with nothing else in cache.

The offline page is precached once, at `install`, into a cache keyed by
a version baked into `sw.js` (`meith-offline-v1`); `activate` deletes any
differently-versioned copy left over from a previous deploy. A deploy
that changes `sw.js` — bumping that version or not — always refetches
`/offline` fresh at install time, so the cached fallback never drifts far
from what a deploy last shipped. Every step here is wrapped so a failure
falls back to a plain network request rather than breaking navigation:
a service worker that throws on `fetch` can brick every reader until it
updates, which is the one failure mode worth designing around.

Two limitations follow from keeping this minimal. First, `/offline` is
English-only by design — it has no data dependency of its own, and
reading the viewer's locale is exactly the kind of dependency it avoids,
so a non-English board still shows an English offline screen. Second,
the `install`-time precache does not retry: if the very deploy that
changes `sw.js` also happens to fail the fetch for `/offline` (a flaky
network at that moment, not the reader being offline — the deploy itself
needed a network to have reached the browser at all), that install
proceeds with no cached fallback until the next deploy tries again. Until
then, a reader who goes offline sees the browser's own error page rather
than this one — the pre-existing behaviour, not a new failure.

`/manifest.webmanifest` is generated per request from the board's own
settings, so the installed application carries the board's name,
description and theme colour and follows them when they change. It is
served whether or not push is on.

### When push does not work

| What you see | What it is |
|---|---|
| No subscribe button at all | **Offer web push** is off, or the keys or the contact are missing. With push on and something missing, `/admin/settings?group=push` says which. |
| The button appears and the browser refuses | Notifications are blocked in the browser's own site settings — or, on iOS, the board is not on the home screen yet. |
| Subscribed, and nothing arrives | Check the worker is running: push goes out on the **tick**, like notification mail. `meith task:list` shows when the outbox last relayed. |
| It worked and then stopped, on one device | The push service dropped the endpoint and the board pruned it. The member resubscribes from the preferences screen. |
| It worked and then stopped, for everybody | The VAPID key pair changed. See the warning above. |
| Nothing on iOS, everything elsewhere | Safari pushes only to an installed board. |

What is stored: `push_subscriptions` holds one row per subscribed
browser — the endpoint, the browser's two keys, the member, and when it
was last successfully pushed to — deleted with the member, deleted when
the push service says the endpoint is gone, and moved to the surviving
account on a merge. `notification_preferences` gains a nullable `push`
column beside `email` (null means the registry's default for that kind),
and `notifications` gains `push_sent_at`. Nothing here is readable by
anybody but the board.

## Scaling

Do not add a second web instance while using process-local cache invalidation. Configure the shared Redis-compatible cache first and follow [Scaling out](./scaling.md). PostgreSQL remains the durable source of truth.

A board deployed to serverless functions has no choice about any of this — every instance is short-lived and disk-less, so the drivers must all be the shared ones. [Running the board on serverless functions](./scaling.md#running-the-board-on-serverless-functions) gives the driver set and the full environment.

## Composer recovery

Signed-in members writing a new thread or reply get two layers of protection.
The browser keeps an unsent local recovery copy and the board debounces changes
into the existing server-side draft. After a crash or reload, a newer browser
copy is offered for explicit restore or discard; it never silently replaces a
newer server draft. The existing **Save draft** action remains available, and
posting clears the server draft through the normal create flow.

Browser storage is crash recovery, not the durable record. Clearing site data
removes that local copy, while server drafts remain in PostgreSQL.

## Cookies and security headers

What the board puts in a visitor's browser, and what it tells the
browser to refuse — the section to read when somebody asks what you
store about them, when a cookie banner is being drafted, or when
something on the board is being blocked and you need to know by what.
None of it is configurable from the admin panel; the one thing that
changes it is an environment variable, named below.

### The cookies

**The board sets no third-party cookies, runs no analytics, and stores
nothing for advertising.** Every cookie below is first-party, set by the
board itself, and there to make a specific thing work.

| Cookie | What it is for | Lifetime |
| --- | --- | --- |
| `fs_session` | The signed-in session | Until it expires or you sign out |
| `fs_remember` | *Remember me* on the sign-in form | The remember period |
| `fs_guest` | Counts one reader once, for "who's online" | 1 day |
| `fs_admin` | Admin-panel re-authentication | The admin session |
| `fs_admin_2fa` | An admin sign-in that has given a password and owes a second factor | Short |
| `fs_2fa` | A sign-in that has given a password and owes a second factor | Short |
| `fs_sso` | The single sign-on handshake | 10 minutes |
| `fs_passkey` | The passkey exchange | Short |

Every one is **`HttpOnly`** — script cannot read any of them — and every
one is **`Secure`** wherever the board is served over HTTPS, where they
also carry the **`__Host-` prefix** (`__Host-fs_session` and so on),
binding each cookie to the exact origin that set it. `SameSite` differs
by purpose: **`Lax`** for the session, remember, guest and SSO cookies —
the SSO one has to be, because an identity provider returns the member
with a top-level navigation from another site, which a `Strict` cookie
is not sent on — and **`Strict`** for the admin, second-factor and
passkey cookies, whose exchanges never start on another site. The admin
cookie is also scoped to `/admin`, so it is not sent with ordinary board
requests at all.

`fs_guest` is the only cookie a visitor gets without signing in, and it
exists for one figure: "37 guests reading". It is **an opaque random
value and nothing else** — no code path turns it into an identity, and
the session lookup refuses a row with no user behind it. Whether it
needs consent where you operate is a question for you, but "strictly
necessary" is an argument you can actually make about it, which is not
true of an analytics cookie.

### The Content Security Policy

Every page is served under a **nonce-based policy**, generated fresh per
request:

```
default-src 'self';
img-src 'self' data:;
style-src 'self' 'unsafe-inline';
script-src 'self' 'nonce-<per-request>' 'strict-dynamic';
connect-src 'self'; worker-src 'self'; manifest-src 'self';
frame-ancestors 'self'; object-src 'none';
base-uri 'self'; form-action 'self'
```

In practice: an injected `<script>` does not run — it has no nonce, and
`'strict-dynamic'` trusts only what the board's own nonced scripts load;
nothing loads from another origin — no CDN, no font host, no embedded
widget, and a theme or plugin that reaches for one is blocked, with the
browser console saying so; a form on your board cannot be made to post
somewhere else; and the board cannot be framed by another site.

**One environment variable changes it.** `REMOTE_IMAGES=1` adds `https:`
to `img-src`, which is what lets members hotlink images from elsewhere.
It is off by default: allowing remote images means every post can make a
reader's browser fetch from a third party, which leaks the reader's IP
address to whoever hosts it.

The e2e suite asserts that every page carries the policy **and that
nothing on the page is refused under it**, so a change that would have
needed `unsafe-inline` fails before it ships.

### The other headers

Sent on every response:

| Header | Value | What it stops |
| --- | --- | --- |
| `X-Content-Type-Options` | `nosniff` | A browser guessing a type and running an upload as script |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | A full path leaking to another site |
| `Strict-Transport-Security` | `max-age=63072000` | A downgrade to HTTP for two years |
| `X-Frame-Options` | `SAMEORIGIN` | Framing, for browsers older than `frame-ancestors` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Anything asking for hardware the board never uses |

If you terminate TLS at a reverse proxy, it has to pass these through
rather than replace them — see
[Docker Compose](../../getting-started/deployment/docker-compose.md) for
the CSP note on proxying.

## Troubleshooting

### Migration does not complete

```sh
docker compose logs migrate
```

Check database health, connection values, required secrets, and the selected release. Web and worker correctly wait when migration fails.

A run that produces no output and does not exit is waiting for the advisory lock, which means another migration holds it — an overlapping deploy, usually. Let it finish; the waiting run then applies nothing and exits 0. A run that hangs with no other migration in flight is a connection problem rather than a lock one: on a managed database, confirm `DIRECT_DATABASE_URL` names the direct connection string and not the pooler. See [Migrations](#migrations).

### Pages load but mail or tasks do not run

```sh
docker compose ps worker
docker compose logs --since 1h worker
```

Validate the worker environment and its access to PostgreSQL and the configured mail endpoint.

### Uploads disappear after recreation

Confirm web and worker both mount the persistent upload volume at `/app/.uploads`. Container layers are replaceable and must not hold the only copy.

### Redirects use the wrong origin

Set `APP_URL` to the public HTTPS origin, not an internal container address. Check reverse-proxy forwarding and recreate affected services.

### A documented command is unavailable

```sh
docker compose run --rm web meith --help
```

Use documentation and CLI output from the version you operate.

## Handover

A new operator needs server and DNS access, the deployment environment, backup locations and retention policy, restore and upgrade procedures, ownership of configured external services, monitoring access, and an administrator account not tied to the departing person.

Rehearse a restore and routine upgrade together. Credentials without a tested procedure are not a complete handover.
