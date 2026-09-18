# Move a board away from Vercel

Move an existing Vercel board to a server while preserving the database and uploads. Rehearse the restore before changing the public domain.

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
[blob or a bucket](vercel-configuration.md):

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
meith backup --uploads include
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
skipped rather than allowed to stop the run, so `meith backup` can
exit **2**: the bundle was written, it names the objects it is missing in
its manifest, and on `blob` those objects are gone once the project is.
Read the list before you delete anything —
[When a bundle is incomplete](backups.md)
explains what to do about it.

This runs from anywhere; it does not have to run on Vercel. Put the
project's variables in front of it and it talks to Neon and to the Blob
store over the network:

```sh
DATABASE_URL=…            # the pooled string
DIRECT_DATABASE_URL=…     # the direct string, for the dump
FILESTORE_DRIVER=blob
BLOB_READ_WRITE_TOKEN=…   # create one on the store — see below
meith backup --uploads include
```

That token is the one value here you make by hand. On the deployment the
board reaches the store with `BLOB_STORE_ID` and the deployment's OIDC
identity, and a command on your own machine has no such identity — so open
the store under **Storage**, create a read-write token, and use it for the
backup. [How the Blob store authenticates](vercel-configuration.md)
has the whole of it.

Copy the bundle somewhere that is none of the four vendors — or set the
`BACKUP_S3_*` variables in front of the command and it ships there itself,
which is also what makes the bundle appear on the board's own
**Admin → System → Backups** screen. That screen cannot *take* a backup on
this route: a function has no `pg_dump` and no disk, and the screen says
so. Scheduling one is the cron on your own machine that runs the command
above; [Backups](backups.md) is the reference.

### 2. Stand up the destination

Follow [Deploying by hand](docker-compose.md) — a server, the compose file,
a `.env` and a proxy — or [Coolify](coolify.md) if you would
rather have the panel. Write the `.env`, and then **bring up Postgres
alone**:

```sh
docker compose up -d postgres
```

**Stop there.** Do not run `docker compose up -d --build` yet, and do not
open `/install`. The full `up` starts the `migrate` container, which
applies the schema and exits 0 — and `meith restore` refuses a target
that already holds tables, saying so rather than writing over them. A
fresh Postgres container gives you the empty database a restore insists
on. This is the same sequence, for the same reason, as
[Disaster recovery § Restore the board](disaster-recovery.md);
follow that page if you want the commands spelled out against a running
stack.

You are restoring a board, not installing one — though the installer can
do it for you: bring the whole stack up instead, set the `BACKUP_S3_*`
values so the fresh board can see the bucket the bundle shipped to, open
`/install`, unlock it with `AUTH_SECRET`, and pick the bundle under **Or restore a backup**. That route
is [Restoring from the installer](backups.md);
the one below is the same restore from a shell.

### 3. Restore into it

```sh
RESTORE_DATABASE_URL=postgres://… meith restore <bundle.tar.gz>
```

`meith restore` refuses to run without `RESTORE_DATABASE_URL` and
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
**before** you move DNS. [Disaster recovery](disaster-recovery.md) is the
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
[Disaster recovery](disaster-recovery.md)
— or move to `s3` while the board is still up, which is the same backup and
restore run against a destination that keeps the objects.
