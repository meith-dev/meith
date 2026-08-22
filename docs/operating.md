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

## Import a legacy board

The importer moves a MyBB or phpBB board into Meith. Read [MyBB parity decisions](./mybb-parity.md) before planning a move from MyBB — it lists every deliberate behavioural difference. The importer is resumable: interrupt it, run the same command again, and it continues from its cursors.

```sh
docker compose run --rm web community import --help
IMPORT_SOURCE_PASSWORD=… community import --source mybb --host db.old --user reader --database mybb --uploads-dir /mnt/old-board/uploads
IMPORT_SOURCE_PASSWORD=… community import --source phpbb --host db.old --user reader --database phpbb --prefix phpbb_ --uploads-dir /mnt/old-board
```

`--source` selects the source forum software (`mybb` is the default; `phpbb` targets phpBB 3.1 or later). The database password comes from `IMPORT_SOURCE_PASSWORD` (`MYBB_PASSWORD` is still accepted) rather than a flag, so it never appears in shell history or `ps`.

`--uploads-dir` points the importer at the legacy board's files so attachments and avatars come across as files, not just rows: for MyBB point it at the board's `uploads/` directory, for phpBB at the installation root (so `files/` and `images/avatars/` resolve). Without it, every attachment row imports marked failed with the legacy path recorded, and avatars are skipped — re-run the same command with `--uploads-dir` later and the files are filled in.

### What imports, per source

| Entity | MyBB | phpBB |
|---|---|---|
| Members, with working legacy passwords | yes | yes (bcrypt, phpass and phpBB2 MD5 hashes) |
| Forum tree | yes | yes |
| Threads and posts | yes | yes (bbcode uid markers and stored smiley/link markup cleaned) |
| Private messages | yes (each member's copy; drafts are not) | yes (one message with every recipient copy) |
| Attachments | yes | yes (post attachments; PM attachments are not) |
| Avatars | uploaded and gallery; remote URLs are not | uploaded and gallery; remote URLs are not |
| Thread and forum subscriptions | yes | yes |
| Polls, options and votes | yes (one vote per member — extra multiple-choice votes are skipped) | yes (same single-vote limit) |
| Reputation, with recomputed totals | yes | phpBB has none |
| Warnings, with recomputed points | yes, including expiry and revocation | minimal — phpBB stores no points, titles or expiry |
| Bans | yes (member moved to the banned group; expired bans lift on the next `bans.expire` run) | user bans; e-mail and IP bans are not |
| Buddy and ignore lists | yes | friends and foes |
| Legacy URL redirects | showthread.php, forumdisplay.php, member.php and rewritten routes | viewtopic.php, viewforum.php, memberlist.php |

Not imported from either source: group permission matrices, custom profile-field values, announcements, smilies and custom BBCode, thread ratings, moderator logs, and per-member IP history. Each import run handles one source; the run record (`import_runs`) keeps per-source cursors, so the same board cannot be half-MyBB and half-phpBB.

Back up the source, rehearse against a non-production board, and run the importer with a read-only database account. After it finishes, run `community task:run counters.reconcile`, reindex search, and verify users, forums, threads, attachments, permissions, and legacy URLs.

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
