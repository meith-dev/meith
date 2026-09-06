# Backups

How Meith takes a backup: from the control panel, on a schedule, off the server,
before an upgrade, and by hand, and how a bundle becomes a board again.
[Disaster recovery](./disaster-recovery.md) is the runbook for the day the
server is gone.

## What a bundle is

Every backup is one file, `meith-backup-<moment>.tar.gz`, holding:

| Member | What it is |
|---|---|
| `db.dump` | A `pg_dump` of the whole database in custom format: accounts, posts, settings, permissions, the scheduler's state, everything the board knows. |
| `uploads.tar.gz` | Avatars, attachments and board images, when the bundle carries them (see [What the bundle carries](#what-the-bundle-carries)). |
| `manifest.json` | When it was taken, by which version, from which file driver, and the keys of any objects the backup could not read. |

The bundle does **not** contain the environment. `AUTH_SECRET` seals every
member's two-factor secret and every sealed credential in the board's settings,
so a restore with a different `AUTH_SECRET` strands both. Keep a copy of the
environment wherever you keep the bundles; [What recovery
consumes](./disaster-recovery.md#what-recovery-consumes) prices each secret.

## The Backups screen

**Admin → System → Backups** is one screen:

- **Back up now** queues a run. The worker picks it up on its next pass
  and runs it beside the board without stopping it. Pressing the button
  twice queues nothing extra: the database allows one queued and one
  running backup at a time.
- **Schedule and retention** summarises the settings below, with the next
  scheduled moment.
- **Off-site destination** says whether bundles are shipped somewhere and
  where the credential came from, with a button that lists the bucket to
  prove the credential works.
- **Bundles** lists every bundle on the server and at the destination,
  newest first, with its size in each place. **Download** streams a
  server copy, or hands you a short-lived signed link when the bundle
  exists only off-site. **Delete** removes it from both places after a
  confirmation.
- **Recent runs** is the log: what asked for the run (panel, schedule,
  migrator or CLI), when, the bundle it wrote, its size, whether it
  shipped, and the error when it failed.

Downloading a bundle asks for a fresh password, like every destructive action in
the panel; after fifteen minutes the download waits until you confirm it again.
A board on in-memory sample data or on serverless functions has nothing to back
up from here. The screen says which, and
[Deployments](#deployments-and-where-the-backups-run) says what to do instead.

A failed run is a failed scheduled task: it shows on **Admin → System** under
*Take due backups*, and administrators are notified as for any failing task. A
run that wrote its bundle but could not ship it is recorded as failed **with the
bundle's name**; nothing is pruned after such a run.

A run heartbeats every thirty seconds, and each heartbeat renews the ten-minute
lease the worker holds on the *Take due backups* task. A run whose heartbeat is
more than five minutes old (the worker was killed mid-dump) is marked failed on
the next pass, its lease lapses within ten minutes, and the next backup goes
ahead. A restore does the same at once to any run the dump caught mid-flight and
to every task lease in the dump.

## Schedule, retention and uploads

The settings live under **Admin → Settings → Backups**. The running board reads
them: no redeploy, no cron to edit.

| Setting | What it does |
|---|---|
| **Automatic backups** | Off, every day, or every week. |
| **Time of day** | When the run starts, as a 24-hour clock in **UTC**. Pick the board's quietest hour. |
| **Day of the week** | For a weekly schedule. A manual backup taken in the same minute as the slot does not stand in for the scheduled one; both are taken. |
| **Backups to keep** | How many of the newest bundles survive a run, on the server and at the destination alike. 7 unless changed. |
| **Days to keep a backup** | An age limit on top of the count. 0 means none. The newest bundle always survives. |
| **Uploads in the bundle** | *Automatic*, *always* or *never*. See below. |
| **Back up before migrating** | Take a bundle before the migrator applies a pending migration. See [Before an upgrade](#before-an-upgrade). |

Pruning happens only after a new bundle is safely written, so a week of failed
backups leaves the last good bundles untouched. It matches the bundle name
pattern exactly and touches nothing else in the directory. Retention is also the
disk knob: a bundle that carries the uploads is roughly the size of the board.
Lower the count rather than dropping the uploads.

### What the bundle carries

*Automatic* decides by where the uploads live:

| `FILESTORE_DRIVER` | Automatic | Why |
|---|---|---|
| `local` | includes the directory | The volume is on the same disk as the database; the bundle is the copy. |
| `blob` | includes the store | A Vercel Blob store has no backup story you can drive yourself; a bundle that skipped it would silently lose the attachments. |
| `s3` | skips the bucket | A bucket has its own backup story and is yours already. Set *Always include* for a bundle that stands alone. |

A bundle without the uploads restores a board whose posts have broken images.
The Backups screen says which the settings amount to.

### When a bundle is incomplete

On `s3` and `blob` the uploads are pulled object by object. An object whose key
the board cannot use cannot be written into the bundle: one that would escape
the staging directory, one holding a `.` or `..` segment, an empty segment,
surrounding whitespace, or a control character. The board never produces such a
key; it arrives when something else writes into the same bucket, or when a key
is mangled in a migration between stores.

The backup **skips that object and finishes the run**. The run is recorded as
*done, incomplete* with the count of skipped objects, the manifest carries the
keys, and a restore prints them back. On the command line the same run exits
**2**.

Do not retry expecting a different result: the next run skips exactly the same
objects. Rename or remove the offending objects in the store, and the next run
carries them.

## Off-site

A ring on the server does not protect against losing the server. Name a
destination and every bundle is also shipped there, pruned there under the same
retention rules, listed and downloadable from the same screen, and offered by
the installer on a fresh machine. Two kinds are supported:

- **An S3-compatible bucket**: Backblaze B2, Cloudflare R2, Hetzner,
  Scaleway, MinIO on a machine you trust. Use **a bucket of its own**,
  never the bucket the uploads live in, or losing the uploads loses their
  backup too. Give the credential only write, list and delete on that
  bucket alone.
- **A WebDAV folder**: Nextcloud, ownCloud, a Hetzner Storage Box,
  anything that speaks WebDAV over HTTPS. The address is a folder that
  already exists (on Nextcloud, something like
  `https://cloud.example/remote.php/dav/files/<user>/board-backups/`).
  The folder itself is never created or removed. Use an app password
  made for this purpose. Downloads of a bundle that exists only there
  stream through the board, since WebDAV has no signed links. Give the
  address the server actually serves: a redirect (`http://` to
  `https://`, or a folder without its trailing slash) is reported rather
  than followed, so credentials never cross one. A server silent for two
  minutes fails the run.

The destination can come from two places, and the environment wins:

- **The board settings**, under **Admin → Settings → Backups**: pick the
  destination and fill in the bucket or WebDAV fields. The secret key and
  the WebDAV password are stored sealed under `AUTH_SECRET`, so a copy of
  the database alone cannot read them. Press **Test the destination**,
  and the next run ships.
- **The environment**: for a bucket, `BACKUP_S3_BUCKET`,
  `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY_ID` and
  `BACKUP_S3_SECRET_ACCESS_KEY`, plus `BACKUP_S3_ENDPOINT` for anything
  that is not AWS itself (with `BACKUP_S3_REGION=auto` for R2) and
  `BACKUP_S3_PREFIX` to share one bucket between boards; all four required
  values or none. For a folder, `BACKUP_WEBDAV_URL`, with
  `BACKUP_WEBDAV_USERNAME` and `BACKUP_WEBDAV_PASSWORD` together or not at
  all. One kind or the other, never both. A partial set fails the backup
  run and never affects the board itself. When these are set the settings
  fields are stored but inert, and the settings screen says so. Use the
  environment when the credential must not live in the database; it is
  also the only source the installer can use, because a fresh board has
  no settings yet.

The compose files forward the `BACKUP_S3_*` and `BACKUP_WEBDAV_*` variables into
every container that takes a backup (web, worker and migrate), so a value set in
`.env`, or on a Coolify resource's
**Environment Variables**, reaches all three.

## Before an upgrade

Migrations are forward-only; the backup is the rollback plan
([Upgrading](./upgrading.md#take-a-backup-first)). **Back up before migrating**
makes the migrator take that backup itself: on finding a pending core migration
on an installed board, it writes a bundle into the ring, ships it off-site,
records the run as *before a migration*, and only then migrates. If the backup
fails the migration is refused and the old code keeps serving.

It is off by default because the `migrate` container needs the backup directory,
the uploads and the `BACKUP_S3_*` variables, which the shipped compose files
give it. Turn it on once your deployment carries this release's compose file.
`meith migrate` and `meith upgrade` honour it the same way.

## Where the bundles live

The ring is the directory `BACKUP_DIR` names: `/backups` in the shipped image,
`./.backups` outside a container. The compose files mount a named `backups`
volume there on `web`, `worker` and `migrate`, so the ring survives every
redeploy and every process that takes a backup writes into the place the panel
lists. It is a separate volume from `uploads`, so a backup of the uploads never
contains older backups of itself.

### Deployments, and where the backups run

| Deployment | Who takes the backup | Notes |
|---|---|---|
| This repository's `docker/compose.yml` and `docker/compose.coolify.yml` ([Coolify](../setting-up/deployment/coolify.md), [Docker Compose by hand](../setting-up/deployment/docker-compose.md)) | The `worker` container | The dedicated `MEITH_ROLE=worker` service runs the *Take due backups* task on its own loop; `web` lists and downloads what it wrote from the shared `backups` volume. |
| A board scaffolded by `create-meith` and deployed as a container | The `web` container, inside the tick | `@meith/worker` is not published, so the scaffold's `worker` service is a small loop calling `/api/system/tick`. The backup runs in `web` during that tick; other tasks are served by the following ticks. |
| [Vercel](../setting-up/deployment/vercel.md) | Nobody, from the panel | A function has no `pg_dump` and no disk. The Backups screen says so; take bundles with the CLI from any machine holding the project's variables (the Vercel guide has the command) and they appear on the screen once they reach the off-site destination. |

A backup runs beside the board and never stops it. The dump holds a consistent
snapshot; members keep posting.

## From the command line

`meith backup` is the same code the panel runs, for a cron of your own, a
Coolify **Scheduled Task**, or a one-off before something risky. It records its
run on the Backups screen, ships to the configured destination (environment
first, board settings otherwise), and prunes under the board's retention unless
`--keep` says otherwise.

```sh
mkdir -p backups
docker compose run --rm --no-deps --user "$(id -u):$(id -g)" -v "$PWD/backups":/backup web \
  meith backup --out /backup/board.tar.gz
```

**Neither the `mkdir` nor the `--user` is optional**, for the same reason
`board:eject` needs them (see [the
marketplace](../developing/marketplace.md#moving-to-a-custom-board)). The image
runs as `nextjs`, uid 1001, which owns nothing on your host, so it can only
write into a directory that account can already write to. Without them the run
ends in `EACCES: permission denied`, naming the directory that needs write
access.

`backup` claims its destination first, creating the file empty and mode `0600`
before it connects to the database, so an unwritable path is refused in under a
second. It **never writes over an existing file**. A run killed part-way can
leave an empty or truncated file at the path it claimed, and the next run
refuses that path by name. Such a file is not a backup and is safe to delete.

The flags:

| Flag | Effect |
|---|---|
| `--out <path>` | One file, refused if anything is there already. |
| `--dir <dir>` | A timestamped bundle into a ring, pruned after the write to the newest `--keep`. `--dir /backups` is the panel's own ring. |
| `--keep <n>` | Bundles to keep, in the ring and at the destination. The board's *Backups to keep* and *Days to keep a backup* unless set; 7 when the board cannot be asked. |
| `--uploads include\|skip` | Override the [automatic choice](#what-the-bundle-carries). |

Exit codes: **0** the bundle is complete; **2** the bundle was written and is
missing objects it names; anything else the backup failed and there is no
bundle. A `2` is not a reason to discard the bundle.

Two commands close the loop with the destination:

```sh
meith backup:list                # the ring at BACKUP_DIR, and the bucket
meith backup:fetch meith-backup-2026-09-01T02-00-00Z.tar.gz
```

Run `backup:list` after the first shipped backup to prove the upload landed.
`backup:fetch` downloads one bundle back, which is how a recovery on a fresh
machine reaches its backup: set the same `BACKUP_S3_*` values there and fetch.

The dump connects over `DIRECT_DATABASE_URL` when it is set and over
`DATABASE_URL` when it is not, the same as `meith migrate`.

## Restoring

A restore only ever writes into an empty board, under both routes.

### From the installer

A fresh deployment against an empty database serves `/install`, and that page
offers **Or restore a backup** beside the install form. It lists every bundle in
the ring and at the off-site destination the environment names, newest first.
Pick one, confirm you hold the `AUTH_SECRET` the board ran with, and press
**Restore this bundle**.

The restore replaces the empty schema with the dump, applies any migrations the
bundle predates, puts the uploads back where the deployment's `FILESTORE_DRIVER`
says they go (the local volume, or a bucket if `FILESTORE_DRIVER=s3`), and seals
the installer. It refuses a board with members, so it cannot be pointed at a
live board by mistake. It refuses a bundle taken by a newer version than the
running code, because migrations are forward-only. It refuses a local uploads
directory that is not empty **before it touches the database**, so a redeploy
that kept the `uploads` volume is told to empty it and nothing has changed.

Then **restart the web and worker containers**, so nothing holds a connection
from before the restore, and sign in with an account from the restored board.
The schedule, retention and destination came back with the settings.

A large board takes minutes and the page waits for it. Do not reload. Every
check runs before the dump goes in, so a refusal leaves the empty board as it
was and the restore can be run again. The two steps after the dump, the
migrations it predates and the uploads, can still fail. If one does, the page
says so: the database is restored, the installer is sealed, and what is left is
to put the uploads back by hand from the `uploads.tar.gz` inside the bundle, or
to run `meith migrate` once the cause is fixed.

### From the command line

`meith restore` is the same operation for a shell, and the one to use for a
rehearsal into a scratch database beside the live one:

```sh
RESTORE_DATABASE_URL=postgres://… meith restore <bundle.tar.gz> [--uploads-dir <dir>] [--skip-uploads]
```

It refuses to run without `RESTORE_DATABASE_URL` and refuses any database that
already holds tables. It applies the migrations the bundle predates, prints the
restored post count, and puts the uploads back the way the installer does, or
into `--uploads-dir`, or nowhere with `--skip-uploads`. A bundle at the
destination comes back with `backup:fetch` first; `restore` reads local files
only. It needs `tar`, `pg_restore` and `psql`; GNU, busybox and BSD tar (macOS)
all work.

A bundle whose manifest records skipped objects restores normally, and the
restore names those objects as it finishes. Posts referring to them have broken
images, and no other copy of them exists.

## Rehearse it

A backup nobody has restored is a file, not a backup. Once, into a scratch
database, restore last week's real bundle and open a thread with attachments.
[The Coolify guide](../setting-up/deployment/coolify.md#7-prove-the-restore)
walks through the ten-minute version in a panel terminal, and [Disaster
recovery](./disaster-recovery.md#rehearse-it-and-write-the-number-down) asks you
to time the full one.
