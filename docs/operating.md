# Operations

This guide is for the person responsible for a running Meith server. It covers routine checks, configuration, maintenance, backup, and common failures.

Installing a board? Use the [Quickstart](./quickstart.md) or [Deploying by hand](./self-hosting.md). Community administration belongs in the [Organiser guide](./organiser-guide.md).

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
community migrate && forum-web build
```

`community migrate` applies every migration the installed release has that the board does not, reports how many it applied, and exits 0 having done nothing when the schema is already current. It needs no build output and no running board, so either end of a deploy is a valid place for it. A failure exits non-zero, which is what stops the `&&` and fails the deployment instead of serving new code against an old schema.

### Two migrations at once

The runner takes a session-level PostgreSQL advisory lock on a fixed key, holds it for the whole run, and releases it when the run ends — including when the run fails. Overlapping migrations therefore queue rather than race: the second waits for the first to finish, then finds the schema current and applies nothing. Two builds triggered close together cannot apply the same core migration twice.

The lock covers the core migration run and nothing after it. `community upgrade` applies each installed plugin's migrations once `runMigrations()` has returned, which is to say once the lock is already released, so two upgrades running at the same instant are serialised through the core schema but not through the plugins'. Run one upgrade at a time.

Nothing has to clean up after a crash. PostgreSQL drops a session-level lock when the connection goes, so a process killed mid-run leaves the lock released and the next attempt proceeds. The lock is held in the database rather than by the board, which is what makes it cover migrations started from different machines against the same database.

### Which connection migrations use

`community migrate` and `community backup` connect over `DIRECT_DATABASE_URL` when it is set and over `DATABASE_URL` when it is not. `community restore` is the exception in the other direction: it writes to `RESTORE_DATABASE_URL` and refuses to run without it, so a restore can never be aimed at the live board by accident. Everything else — web, worker, the tick — always uses `DATABASE_URL`.

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
docker compose run --rm web community env:check
```

Inspect settings:

```sh
docker compose run --rm web community settings:list
docker compose run --rm web community settings:get <key>
```

Set a value from the terminal only when the admin interface is unavailable:

```sh
docker compose run --rm web community settings:set <key> <value>
```

The standard deployment requires a PostgreSQL password, `AUTH_SECRET`, `TICK_SECRET`, and the public `APP_URL`. Generate secrets independently, protect the `.env` file, and never commit it.

`TICK_SECRET` protects `/api/system/tick`, the HTTP form of the worker's tick. A deployment with no long-lived worker process drives that endpoint from a cron scheduler instead, and `CRON_SECRET` is the second name the same endpoint accepts it under, for a scheduler that can only send `Authorization: Bearer` under that name. Either variable on its own protects the endpoint, and production refuses to boot with neither — see [Monitoring](./monitoring.md#driving-the-tick-over-http) for the request and response contract.

Use `community --help` for the exact commands supported by the installed release.

## The operator CLI

`community` is the operator CLI, and every maintenance command on this page is one of its subcommands. How you reach it depends on the deployment:

| Deployment | Invocation |
|---|---|
| Compose — the supported stack, and the by-hand one | `docker compose run --rm web community <command>` |
| A platform that only builds and serves | `community <command>`, from a checkout of the board repository with the production environment in front of it — see [Running on Vercel](./vercel.md) |

`--rm` stops the one-shot containers accumulating. Add `-T` when the command reads standard input, as creating a user does under [Account recovery](#account-recovery).

There is no container to run a command inside on the second route, which is why it runs from a checkout instead; the one command that does not wait for an operator is `community migrate`, which belongs in the build command ahead of the build — see [Migrations](#migrations).

The CLI reaches the database directly, so it works when the board's pages do not — which is what makes it the route back in when administrator access is lost. It is also the only route for the commands that have no admin-panel equivalent: `backup`, `restore`, `migrate` and `upgrade`.

`community --help` lists what the installed release actually has. A command documented here that is missing there means the running image is older than the page — see [A documented command is unavailable](#a-documented-command-is-unavailable).

## Mail

The worker sends queued mail, so web and worker need the same mail configuration. The standard Compose file forwards the supported HTTP and SMTP environment values.

After a change:

1. recreate web and worker;
2. run `community env:check`;
3. trigger a real board email;
4. inspect worker logs and the receiving mailbox.

A successful network connection is not proof of delivery.

## Scheduled tasks

```sh
docker compose run --rm web community task:list
docker compose run --rm web community task:run
docker compose run --rm web community task:run <task-id>
```

Manual execution follows the same due and claim rules as the worker. Use it for diagnosis, not as a permanent scheduler.

## Backup

Create a restorable bundle with:

```sh
docker compose run --rm web community backup --help
```

Follow the usage printed by the installed release. Include uploads when they use the local volume, write the bundle to a mounted path, and copy at least one version off the server.

A useful policy records frequency, retention, off-server location, access ownership, and the last successful restore rehearsal. A backup is not proven until it restores into an empty target.

## Restore

Restore only into a new, empty database. Stop traffic and review the installed command first:

```sh
docker compose run --rm web community restore --help
```

After restore, apply migrations for the selected release, start web and worker, and verify sign-in, recent threads, uploads, mail, and scheduled tasks before changing DNS. See [Disaster recovery](./disaster-recovery.md) for the complete runbook.

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
printf '%s' '<password>' | docker compose run --rm -T web community user:create --username <name> --email <address>
```

Promote a user:

```sh
docker compose run --rm web community user:promote --user <id-or-username> --group <key-or-id>
```

Clear a lost second factor and end that user's sessions:

```sh
docker compose run --rm web community user:2fa-clear --user <id-or-username>
```

Record who requested any recovery change.

## Search maintenance

Rebuild missing full-text records with the resumable command:

```sh
docker compose run --rm web community search:reindex
```

Use it after an import or when diagnostics show posts without search data. It is safe to repeat.

## Import a legacy board

The importer moves a MyBB or phpBB board into Meith, and is resumable:
interrupt it, run the same command again, and it continues from its
cursors. The full procedure — what to check first, per-source coverage,
what to do after it finishes, and troubleshooting — is
[Migrating from MyBB or phpBB](./migrating.md). Quick reference for
somebody who has already read it:

```sh
docker compose run --rm web community import --help
IMPORT_SOURCE_PASSWORD=… community import --source mybb --host db.old --user reader --database mybb --uploads-dir /mnt/old-board/uploads
IMPORT_SOURCE_PASSWORD=… community import --source phpbb --host db.old --user reader --database phpbb --prefix phpbb_ --uploads-dir /mnt/old-board
```

`--source` selects the source forum software (`mybb` is the default; `phpbb` targets phpBB 3.1 or later). The database password comes from `IMPORT_SOURCE_PASSWORD` (`MYBB_PASSWORD` is still accepted) rather than a flag, so it never appears in shell history or `ps`. `--uploads-dir` copies attachments and avatars across as files; without it, attachment rows import marked failed and avatars are skipped, until the same command is run again with the flag.

Back up the source, rehearse against a non-production board, and run the importer with a read-only database account. After it finishes, run `community task:run counters.reconcile`, reindex search, and verify users, forums, threads, attachments, permissions, and legacy URLs — [Migrating from MyBB or phpBB](./migrating.md#after-the-import) has the full checklist.

## Plugins

Installing a manifest-eligible plugin — one that ships a zero-argument `plugin` export, see
[Writing a plugin](./plugin-api.md#writing-a-plugin) — is a checkout-time change, run where you
would run `pnpm add`, not against the deployed image:

```sh
pnpm add @meith/plugin-dues --filter @meith/web
community plugin:add @meith/plugin-dues
```

`plugin:add` and `plugin:remove` edit `board.plugins.json` and regenerate
`community.plugins.ts`; commit both and rebuild and redeploy the image for the change to take
effect. A plugin that cannot yet satisfy the manifest's export convention stays a line in
`community.plugins.ts` you write by hand, exactly as before.

Before removing plugin code, purge its owned data through the lifecycle hook — this one *does*
run against the deployed board, because it needs the live database:

```sh
docker compose run --rm web community plugin:purge <key> --yes
```

Removing files first can leave data without the code required to clean it up.

## Web push

Generate VAPID keys with:

```sh
docker compose run --rm web community push:keys
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
docker compose run --rm web community --help
```

Use documentation and CLI output from the version you operate.

## Handover

A new operator needs server and DNS access, the deployment environment, backup locations and retention policy, restore and upgrade procedures, ownership of configured external services, monitoring access, and an administrator account not tied to the departing person.

Rehearse a restore and routine upgrade together. Credentials without a tested procedure are not a complete handover.
