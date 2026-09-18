# Database migrations and connections

Configure database connections and apply core migrations before serving a new build. This page explains direct connections, migration locking and the separate plugin migration step.

## Migrations

Applying the schema is always a separate step from starting the board. Under Compose the one-shot `migrate` service does it and `web` waits for that service to exit 0. Where the deployment has no place to run a one-shot job — a platform that only builds and serves — the same step belongs in the build command, ahead of the build:

```sh
meith migrate && forum-web build
```

`meith migrate` applies every migration the installed release has that the board does not, reports how many it applied, and exits 0 having done nothing when the schema is already current. It needs no build output and no running board, so either end of a deploy is a valid place for it. A failure exits non-zero, which is what stops the `&&` and fails the deployment instead of serving new code against an old schema.

The runner compares migration file hashes with `drizzle.__drizzle_migrations`
and applies missing migrations in journal order, within one transaction.
A failed run rolls back. For boards upgraded through the older timestamp-based
runner, see [migration recovery](upgrade-notes.md#meith-migrate-decides-by-hash-not-by-timestamp).

Once the board is up, an admin can apply pending **plugin** migrations from **Admin → System** (**Version & migrations**) after a re-entered password — the setup a newly installed plugin needs, which the Compose `migrate` service (it runs `meith migrate`, core only) does not. Core schema migrations are not run from the panel: they belong to the deploy step, run against a direct connection before `web` serves, which is what keeps it from ever serving against an older schema. The panel does count them, though: the notice on **Admin → System** and the admin index asks the database which core migrations of the running release are not recorded, and names how many are missing — whatever version the board has recorded, so a schema that fell behind is reported even when the versions agree. While any are missing the panel's own upgrade refuses to run, naming them and pointing at `meith migrate`, rather than recording the code version over a schema that is not at it. A runtime that cannot reach the migration files (a build-and-serve platform's serverless function) is the one place the count is unavailable; the notice then falls back to comparing versions, and says so once in the log.

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
