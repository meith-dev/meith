# Disaster recovery

This page is the runbook for the bad day: the server is gone — seized,
dead, deleted, or unreachable in a way that is not coming back — and the
board has to exist again somewhere else.
[Backup and restore](./operating.md#backup) is the everyday
half of this story: what to take, how to take it, and how to restore one
piece. This page is the order of operations when *everything* has to be
restored at once, written to be followed under stress. Read it once on a
calm day; the last section asks you to do slightly more than read it.

## What recovery consumes

Recovery is assembled from three artifacts, and the reason each backup
guide says **copy them off the machine** is that this page assumes the
machine is gone:

| Artifact | Without it |
|---|---|
| The database dump — the `community backup` bundle carries it | There is no board to recover. Everything the board knows — accounts, posts, settings, permissions — is here. |
| The uploads — in the same bundle on local disk, or the S3 bucket, or a Vercel Blob store | Every post keeps its text and loses its images; every member loses their avatar. A board on [object storage](./scaling.md#what-already-scales) skips this step entirely: the bucket never lived on the machine. A board on a Vercel Blob store cannot skip it — the store has no second copy and no way to sync one out, so the bundle is it. |
| The environment — your `.env`, or the secrets the panel generated | The board boots with new secrets, but `AUTH_SECRET` seals members' two-factor secrets: lose it and every enrolled authenticator app is stranded, and every unsubscribe link in already-sent mail dies. Sessions survive either way — they are random tokens stored hashed in the database. |

The code is not on the list. It is in git, pinned by the release tag the
board was running — which the dump itself can tell you: the recorded
version is in the database, and the admin panel showed it every day.

## The order

Each step exists because a later one assumes it. Resist reordering under
pressure — restoring uploads before the database wastes no work, but
serving traffic before verifying does.

### 1. Provision

A server like the one you lost: the
[requirements](../../getting-started/deployment/docker-compose.md#what-you-need) have not changed because
the old machine died. Install Docker, clone the repository, and check out
**the release the board was running** — never a newer one, never `main`:

```sh
git clone https://github.com/meith-dev/meith && cd meith/docker
git checkout v0.12.0
```

Recovering and upgrading are two changes; make them one at a time. Once
the board is verified and serving, upgrade the ordinary way —
[Upgrading a board](./upgrading.md) — with this recovery as the backup
you just proved restorable.

### 2. Write the environment

Recreate `.env` from your copy — the same `POSTGRES_PASSWORD`, the same
`AUTH_SECRET`, the same `TICK_SECRET`, the same `S3_*` and mail values.
This step comes before the database because the compose stack will not
start without it, and the migrator refuses to run unnamed.

If a secret truly is lost, the table above says what each one costs.
`TICK_SECRET` is the cheap one — generate a new value and update whatever
external scheduler presents it, if anything does. `AUTH_SECRET` is the
expensive one; regenerating it means telling your members to re-enrol
their authenticator apps, so exhaust the places a copy might be first.

### 3. Restore the board

Bring up Postgres alone, restore into it, and keep the board down until
the data is in:

```sh
docker compose up -d postgres
RESTORE_DATABASE_URL="postgres://community:$POSTGRES_PASSWORD@postgres:5432/community" \
  docker compose run --rm --no-deps -e RESTORE_DATABASE_URL -v "$PWD":/backup web \
  node apps/cli/cli.cjs restore /backup/meith-backup-2026-08-20T04-17-03Z.tar.gz
```

The fresh Postgres container created an empty `community` database, which
is exactly what [`community restore`](./operating.md#restore) insists
on. One command puts back the dump *and* the uploads — `docker compose
run` mounts the same uploads volume the board serves from — and applies
any migrations the bundle predates; on a bundle taken from the same
version it reports nothing to do, and that silence is itself a check.

Backups taken by hand instead — a bare dump beside an uploads archive —
restore the way they were taken:

```sh
gunzip -c board-2026-08-20.sql.gz | docker compose exec -T postgres psql -U community community
docker run --rm -v docker_uploads:/u -v "$PWD":/backup alpine \
  tar xzf /backup/uploads-2026-08-20.tar.gz -C /u
```

(`docker volume ls` for the real volume name — Compose prefixes it with
the project directory. A `--format=custom` dump goes through
`pg_restore --no-owner --no-privileges` —
[Restore](./operating.md#restore) covers the command.)

### 4. The uploads, when they lived elsewhere

On S3 there is nothing to restore: confirm the credential in `.env` still
works and move on — unless the bucket is gone too, in which case a bundle
taken with `--uploads include` holds every object, and restoring it with
the S3 driver configured pushes them back up. This asymmetry is most of
the argument for
[moving uploads to object storage](./scaling.md#migrating-a-single-instance-board)
on a calm day.

On a **Vercel Blob store** the asymmetry runs the other way, and it is the
one case where the backup is the only copy. A Blob store is reachable only
through Vercel's API — there is no bucket to sync, no credential to hand a
second tool, and deleting the Vercel project deletes the attachments with
it. So `community backup` includes the uploads by default under
`FILESTORE_DRIVER=blob`, and the command runs from anywhere with the
project's variables in the environment rather than having to run on
Vercel:

```sh
DATABASE_URL=…            # the pooled string
DIRECT_DATABASE_URL=…     # the direct string, for the dump
FILESTORE_DRIVER=blob
BLOB_READ_WRITE_TOKEN=…   # created on the store; see below
community backup
```

That token is the one value you make by hand. A Blob store attached to a
Vercel project publishes `BLOB_STORE_ID` and no token, because on the
deployment the SDK authenticates with the deployment's own OIDC identity —
which a command on your own machine does not have. Open the store under
**Storage**, create a read-write token, and use it here. See
[Running on Vercel](../../getting-started/deployment/vercel.md#how-the-blob-store-authenticates).

Read the last line it prints. `the database dump and the uploads` means
the objects are in the bundle; `the database dump, no uploads` means the
store was empty or `--uploads skip` was passed, and restoring that bundle
gives a board whose posts have broken images.

Then read the exit code. A backup that met an object it could not read —
a key with a `.` segment, a control character, anything else the board
cannot use — skips that object, finishes the bundle, names the key, and
exits **2** instead of 0. The bundle is sound and is the most complete
copy that can be taken; it records the skipped keys in its manifest, and
the restore below prints them back. On a Blob store those objects have no
second copy, so treat the list as a loss to be understood now rather than
discovered by a member six months from now.
[When a bundle is incomplete](./operating.md#when-a-bundle-is-incomplete)
covers the whole of it, including why a scheduled backup should not
retry.

Restoring puts the objects wherever the *restoring* board's
`FILESTORE_DRIVER` points, so one bundle moves a board off Vercel as
easily as back onto it: `FILESTORE_DRIVER=s3` with the `S3_*` variables
pushes every object into a bucket, and `--uploads-dir` writes them to a
disk instead.

### 5. Boot and verify

```sh
docker compose up -d --build
```

Then the same three checks a
[restore rehearsal](#rehearse-it-and-write-the-number-down) uses, plus two this
situation adds:

1. `select count(*) from posts;` — the content is there.
2. Sign in as an administrator — the credentials survived.
3. `community upgrade --dry-run` — it reports nothing to do.
4. Open a thread with attachments and a page with avatars — the uploads
   restore actually met the database restore.
5. `/admin/settings?group=mail` → **Send a test message** — mail is the
   subsystem that fails silently, and the provider may be seeing a new IP
   address.

Verify on the new machine directly — `curl` against localhost, or a
hosts-file entry for your domain — while the world still resolves to the
old address. Nothing here needs DNS.

### 6. Cut over

Point the domain at the new machine. The reverse proxy obtains its
certificate on the first request after DNS moves ([put a proxy in
front](../../getting-started/deployment/docker-compose.md#5-put-a-proxy-in-front)); until propagation
finishes, some visitors reach the corpse and some the recovery — which is
another reason the old address should serve nothing rather than something
stale. If you can plan ahead at all, a short TTL on the record turns this
step from hours into minutes.

### 7. Resume the backups

The new machine has no cron, and the recovery you just finished consumed
a backup rather than producing one. Re-create the schedule you had,
using the command in [Backup](./operating.md#backup), run it once by
hand, and copy the result off the machine — the next disaster does not
care how recent the last one was.

## Partial losses are smaller pages

Full loss is rare; most bad days are one of these, and each has a shorter
answer than this runbook:

| What happened | Do this |
|---|---|
| A bad upgrade | Restore the pre-upgrade backup — [Downgrades](./upgrading.md#downgrades) explains why that is the whole answer. |
| The database is fine, uploads are gone | Restore the uploads archive alone (step 4); the board can serve, with broken images, while it runs. |
| Uploads are fine, the database is gone | Steps 3 and 5. Do not skip the verification because the machine survived. |
| The Valkey/Redis cache server died | Nothing. It held [cache entries only](./scaling.md#what-redis-is-and-is-not-used-for); restart it and the cache warms on the next requests. |
| The disk is full | Not a restore at all — free space (old backups on the server are the usual culprit, which is its own lesson) and the board resumes. |

## Rehearse it, and write the number down

The [backup page's advice](./operating.md#backup) — a backup nobody
has restored is a file, not a backup — applies to this whole page: a
runbook nobody has run is a hope, not a plan. Once, on a scratch server
or a laptop, run steps 1 through 5 against last week's real backups and
time it. That number is your recovery time; the gaps you hit are this
page's errata for your board — a panel-generated secret you never copied,
a volume name you guessed wrong. Fix what you find, note the time
somewhere that is not on the server, and repeat after anything about the
deployment changes shape.
