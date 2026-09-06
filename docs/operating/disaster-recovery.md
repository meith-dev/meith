# Disaster recovery

The runbook for the day the server is gone and the board has to exist
again somewhere else. [Backups](./backups.md) covers what to take and how
to restore one piece; this page is the order of operations when
*everything* has to be restored at once. Read it on a calm day, and do
what the last section asks.

## What recovery consumes

Recovery needs three artifacts, and this page assumes the machine that
held them is gone. That is why every backup guide says **copy them off
the machine**.

| Artifact | Without it |
|---|---|
| The database dump, which the `meith backup` bundle carries | There is no board to recover. Everything the board knows (accounts, posts, settings, permissions) is here. |
| The uploads, in the same bundle on local disk, or the S3 bucket, or a Vercel Blob store | Every post keeps its text and loses its images; every member loses their avatar. A board on [object storage](./scaling.md#what-already-scales) skips this step: the bucket never lived on the machine. A board on a Vercel Blob store cannot skip it. The store has no second copy and no way to sync one out, so the bundle is it. |
| The environment: your `.env`, or the secrets the panel generated | The board boots with new secrets, but `AUTH_SECRET` seals members' two-factor secrets. Lose it and every enrolled authenticator app is stranded, and every unsubscribe link in already-sent mail dies. Sessions survive either way; they are random tokens stored hashed in the database. |

The code is not on the list. It is in git, pinned by the release tag the
board was running, and the dump records that version.

## The order

Each step exists because a later one assumes it. Do not serve traffic
before verifying.

### 1. Provision

A server that meets the
[requirements](../setting-up/deployment/docker-compose.md#what-you-need).
Install Docker, then get the board back **at the release it was running**,
never a newer one. If you pushed the scaffold to its own repository, its
`package.json` pins the exact version:

```sh
git clone https://github.com/<you>/my-board && cd my-board
```

Without that repository, scaffold it fresh at the version your last
backup names:

```sh
npx create-meith@0.12.0 my-board && cd my-board
```

Recovering and upgrading are two changes; make them one at a time. Once
the board is verified and serving, upgrade the ordinary way
([Upgrading a board](./upgrading.md)).

### 2. Write the environment

Recreate `.env` from your copy: the same `POSTGRES_PASSWORD`,
`AUTH_SECRET`, `TICK_SECRET`, `S3_*` and mail values. The compose stack
will not start without it, and the migrator refuses to run unnamed.

If a secret is lost, the table above says what it costs. `TICK_SECRET` is
cheap: generate a new value and update whatever external scheduler
presents it. `AUTH_SECRET` is expensive; regenerating it means telling
your members to re-enrol their authenticator apps, so exhaust the places a
copy might be first.

### 3. Restore the board

Two ways in, and the first needs no shell.

**From the installer.** Bring the whole stack up with `docker compose up -d
--build` and open the board. `migrate` writes an empty schema, the board
serves `/install`, and that page offers **Or restore a backup** beside the
install form: every bundle in the `backups` volume and at the off-site
destination the `.env` names, newest first. Put the bundle you saved into
the volume (`docker compose cp meith-backup-….tar.gz web:/backups/`), or
let the installer fetch it from the bucket. Pick it, confirm you hold the
`AUTH_SECRET` the board ran with, and press **Restore this bundle**. It
replaces the empty schema with the dump, applies any migrations the bundle
predates, puts the uploads back on the volume, and seals the installer.
Then restart web and worker.
[Restoring from the installer](./backups.md#from-the-installer) has the
detail, including why it refuses a board with members and a bundle from a
newer version.

**From a shell.** Bring up Postgres alone, restore into it, and keep the
board down until the data is in:

```sh
docker compose up -d postgres
RESTORE_DATABASE_URL="postgres://community:$POSTGRES_PASSWORD@postgres:5432/community" \
  docker compose run --rm --no-deps -e RESTORE_DATABASE_URL -v "$PWD":/backup web \
  meith restore /backup/meith-backup-2026-08-20T04-17-03Z.tar.gz
```

The fresh Postgres container created the empty `community` database that
[`meith restore`](./backups.md#from-the-command-line) insists on. One
command puts back the dump *and* the uploads, because `docker compose run`
mounts the uploads volume the board serves from, and applies any
migrations the bundle predates. On a bundle from the same version it
reports nothing to do.

Backups taken by hand (a bare dump beside an uploads archive) restore the
way they were taken:

```sh
gunzip -c board-2026-08-20.sql.gz | docker compose exec -T postgres psql -U community community
docker run --rm -v docker_uploads:/u -v "$PWD":/backup alpine \
  tar xzf /backup/uploads-2026-08-20.tar.gz -C /u
```

Run `docker volume ls` for the real volume name; Compose prefixes it with
the project directory. A `--format=custom` dump goes through
`pg_restore --no-owner --no-privileges`.

### 4. The uploads, when they lived elsewhere

On S3 there is nothing to restore: confirm the credential in `.env` still
works and move on. If the bucket is gone too, a bundle taken with
`--uploads include` holds every object, and restoring it with the S3
driver configured pushes them back up. This is most of the argument for
[moving uploads to object storage](./scaling.md#migrating-a-single-instance-board)
on a calm day.

On a **Vercel Blob store** the backup is the only copy. A Blob store is
reachable only through Vercel's API, there is no bucket to sync, and
deleting the Vercel project deletes the attachments with it. So
`meith backup` includes the uploads by default under
`FILESTORE_DRIVER=blob`, and the command runs from anywhere with the
project's variables in the environment:

```sh
DATABASE_URL=…            # the pooled string
DIRECT_DATABASE_URL=…     # the direct string, for the dump
FILESTORE_DRIVER=blob
BLOB_READ_WRITE_TOKEN=…   # created on the store; see below
meith backup
```

That token is the one value you make by hand. A Blob store attached to a
Vercel project publishes `BLOB_STORE_ID` and no token, because on the
deployment the SDK authenticates with the deployment's own OIDC identity,
which your own machine does not have. Open the store under **Storage**,
create a read-write token, and use it here. See
[Running on Vercel](../setting-up/deployment/vercel.md#how-the-blob-store-authenticates).

Read the last line it prints. `the database dump and the uploads` means
the objects are in the bundle; `the database dump, no uploads` means the
store was empty or `--uploads skip` was passed, and restoring that bundle
gives a board whose posts have broken images.

Then read the exit code. A backup that met an object it could not read (a
key with a `.` segment, a control character, anything else the board
cannot use) skips that object, finishes the bundle, names the key, and
exits **2** instead of 0. The bundle is sound; it records the skipped keys
in its manifest, and the restore prints them back. On a Blob store those
objects have no second copy, so treat the list as a loss to understand
now. [When a bundle is incomplete](./backups.md#when-a-bundle-is-incomplete)
covers it, including why a scheduled backup should not retry.

Restoring puts the objects wherever the *restoring* board's
`FILESTORE_DRIVER` points, so one bundle moves a board off Vercel as
easily as back onto it: `FILESTORE_DRIVER=s3` with the `S3_*` variables
pushes every object into a bucket, and `--uploads-dir` writes them to a
disk instead.

### 5. Boot and verify

```sh
docker compose up -d --build
```

Then the three checks a
[restore rehearsal](#rehearse-it-and-write-the-number-down) uses, plus two:

1. `select count(*) from posts;`: the content is there.
2. Sign in as an administrator: the credentials survived.
3. `meith upgrade --dry-run`: it reports nothing to do.
4. Open a thread with attachments and a page with avatars: the uploads
   restore met the database restore.
5. `/admin/settings?group=mail` → **Send a test message**. Mail is the
   subsystem that fails silently, and the provider may be seeing a new IP
   address.

Verify on the new machine directly, with `curl` against localhost or a
hosts-file entry for your domain, while the world still resolves to the
old address. Nothing here needs DNS.

### 6. Cut over

Point the domain at the new machine. The reverse proxy obtains its
certificate on the first request after DNS moves
([put a proxy in front](../setting-up/deployment/docker-compose.md#5-put-a-proxy-in-front)).
Until propagation finishes some visitors reach the old address, so it
should serve nothing rather than something stale. A short TTL on the
record turns this step from hours into minutes.

### 7. Resume the backups

The schedule, the retention and the destination are board settings, so
they came back with the dump (a destination set in the environment is
whatever the new `.env` says), but nothing has run yet on this machine.
Open **Admin → System → Backups**, press **Back up now**, and check the
bundle lands where it should, off-site included. A cron or Scheduled Task
built around `meith backup` is the one thing the old server took with it;
[Backups](./backups.md) has both shapes.

## Under Coolify

A board deployed by [the Coolify guide](../setting-up/deployment/coolify.md)
has a panel instead of a shell, and if its
[backup section](../setting-up/deployment/coolify.md#6-set-up-backups)
was followed its backups live in an S3-compatible bucket the new machine
can fetch from itself. The same order, mapped:

1. **Provision**: a new server, Coolify installed on it (the guide's step
   1), and the board resource created from the same repository (its steps
   2 and 3), **stopping before the first deploy**. Deploy the release the
   board was running, not a newer one: on the quick-start path your
   repository's `main` pins it already unless you have pushed since; on
   the prebuilt path set `MEITH_IMAGE` to the version the old board ran.

2. **Write the environment**: on the new resource's **Environment
   Variables**, Coolify has generated *fresh* values for
   `SERVICE_BASE64_64_AUTH`, `SERVICE_BASE64_64_TICK` and
   `SERVICE_PASSWORD_POSTGRES`. Paste your day-one copies over all three
   **before the first deploy**: the database password is baked into the
   data volume on its first boot, and a fresh `AUTH_SECRET` costs what the
   table at the top says. Set the `BACKUP_S3_*` values too, so this
   machine can reach the bundles.

3. **Deploy once**: the four containers come up and `migrate` writes an
   empty schema. The board now serves `/install`; open it, but do **not**
   fill in the install form. An installer run here would create a second
   board you would only have to drop again.

4. **Restore**: on `/install`, **Or restore a backup** lists every bundle
   at the off-site destination. Pick the newest, confirm you hold the
   `AUTH_SECRET`, and press **Restore this bundle**. The fresh schema is
   replaced by the dump, the uploads land on the fresh volume, and the
   installer seals itself. The shell route still works: resource
   **Terminal**, container `web`:

   ```sh
   meith backup:list
   meith backup:fetch <the newest bundle> --out /backups/restore.tar.gz
   ```

   Container `postgres`:

   ```sh
   psql -U community -d postgres -c 'drop database community with (force)'
   createdb -U community community
   ```

   Container `web` again:

   ```sh
   RESTORE_DATABASE_URL="$DATABASE_URL" meith restore /backups/restore.tar.gz
   ```

5. **Restart the resource and verify**: step 5's checks, unchanged,
   against the resource's generated domain or a hosts-file entry while
   the world still resolves to the old address.

6. **Cut over, then resume the backups**: steps 6 and 7 above.
   **Back up now** on **Admin → System → Backups** proves the new resource
   can ship a bundle, and the same screen shows it arrive.

## Partial losses are smaller pages

Full loss is rare; most bad days are one of these:

| What happened | Do this |
|---|---|
| A bad upgrade | Restore the pre-upgrade backup. [Downgrades](./upgrading.md#downgrades) explains why that is the whole answer. |
| The database is fine, uploads are gone | Restore the uploads archive alone (step 4); the board can serve, with broken images, while it runs. |
| Uploads are fine, the database is gone | Steps 3 and 5. Do not skip the verification because the machine survived. |
| The Valkey/Redis cache server died | Nothing. It held [cache entries only](./scaling.md#what-redis-is-and-is-not-used-for); restart it and the cache warms on the next requests. |
| The disk is full | Not a restore at all. Free space (old backups on the server are the usual culprit) and the board resumes. |

## Rehearse it, and write the number down

The [backup page's advice](./backups.md#rehearse-it) applies here too: a
runbook nobody has run is a hope, not a plan. Once, on a scratch server or
a laptop, run steps 1 through 5 against last week's real backups and time
it. That number is your recovery time, and the gaps you hit (a
panel-generated secret you never copied, a volume name you guessed wrong)
are this page's errata for your board. Fix what you find, note the time
somewhere that is not on the server, and repeat after anything about the
deployment changes shape.
