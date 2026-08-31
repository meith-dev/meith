# Operations

This guide is for the person responsible for a running Meith server. It covers routine checks, configuration, maintenance, backup, and common failures.

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

Once the board is up, an admin who deployed a release without running this can apply what is pending from **Admin → System** (**Version & migrations**) — the same core and plugin migrations `meith upgrade` runs, applied from the panel after a re-entered password. It is there for the forgotten step after a deploy, not a replacement for the deploy-time `migrate`, which is what keeps `web` from ever serving against an older schema.

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

The CLI reaches the database directly, so it works when the board's pages do not — which is what makes it the route back in when administrator access is lost. Applying a release's pending migrations — the `upgrade` step — is also on the panel now, under **Admin → System** (**Version & migrations**), so a routine upgrade needs no shell; `backup`, `restore` and the deploy-time `migrate` stay CLI-only.

`meith --help` lists what the installed release actually has. A command documented here that is missing there means the running image is older than the page — see [A documented command is unavailable](#a-documented-command-is-unavailable).

## Mail

The worker sends queued mail, so web and worker need the same mail configuration. The standard Compose file forwards the supported HTTP and SMTP environment values.

After a change:

1. recreate web and worker;
2. run `meith env:check`;
3. trigger a real board email;
4. inspect worker logs and the receiving mailbox.

A successful network connection is not proof of delivery.

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

After restore, apply migrations for the selected release, start web and worker, and verify sign-in, recent threads, uploads, mail, and scheduled tasks before changing DNS. See [Disaster recovery](./disaster-recovery.md) for the complete runbook.

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

Generate VAPID keys with:

```sh
docker compose run --rm web meith push:keys
```

Use `--save` only when you want the CLI to store the pair in board settings. Read [Web push](./web-push.md) for setup and privacy implications.

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
