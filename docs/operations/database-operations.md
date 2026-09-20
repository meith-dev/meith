# Database operations

## Migrations

Run core migrations before serving a new build:

```sh
npm run meith -- migrate
npm run build
```

Run these from the board directory. Compose's one-shot `migrate` service performs this step and must exit 0 before web starts. Function-hosted builds must also run migration before build.

The runner compares file hashes with `drizzle.__drizzle_migrations`, then applies missing migrations in journal order in one transaction. Failure rolls back; an up-to-date run applies nothing. See [Older migration recovery](upgrade-notes.md#meith-migrate-decides-by-hash-not-by-timestamp).

`meith upgrade` additionally applies enabled plugin migrations and records versions. **Admin → System → Version & migrations** handles pending plugin migrations only and refuses while core migrations are missing. If runtime migration files are unavailable, the panel falls back to version comparison.

## Connection pooling

| Process | Connection |
|---|---|
| Web, worker, tick | `DATABASE_URL` |
| Migration and backup | `DIRECT_DATABASE_URL`, otherwise `DATABASE_URL` |
| Restore | Required `RESTORE_DATABASE_URL` |

For a managed transaction pooler, set both pooled `DATABASE_URL` and direct `DIRECT_DATABASE_URL`. Migrations use a session advisory lock, which transaction pooling cannot preserve. A self-hosted PostgreSQL connection without a pooler can use `DATABASE_URL` alone.

Each process opens its own pool (`DATABASE_POOL_MAX`, default 3, maximum 20). Budget for all web replicas, workers and maintenance processes.

## Concurrent migrations

Core migration runs acquire one PostgreSQL advisory lock. Concurrent runs wait, then recheck applied hashes. PostgreSQL releases the lock when the session ends, including after a crash.

The lock ends before plugin migrations. Run only one full upgrade at a time. If migration hangs without another run, verify the direct connection rather than assuming lock contention.
