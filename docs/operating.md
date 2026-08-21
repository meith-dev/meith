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

Use `community --help` for the exact commands supported by the installed release.

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

## Import a MyBB board

Read [MyBB parity decisions](./mybb-parity.md) before planning the move. The importer is resumable:

```sh
docker compose run --rm web community import --help
```

Use the usage from the target release, back up the source, and rehearse against a non-production board. Run the importer again after interruption. Then reindex search and verify users, forums, threads, attachments, permissions, and legacy URLs.

## Plugins

Install plugins written for the board's release. Before removing plugin code, purge its owned data through the lifecycle hook:

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

## Troubleshooting

### Migration does not complete

```sh
docker compose logs migrate
```

Check database health, connection values, required secrets, and the selected release. Web and worker correctly wait when migration fails.

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
