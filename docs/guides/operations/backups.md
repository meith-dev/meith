# Backups

A board accumulates years of a community's writing, and the backup is the
only way back from a bad day. This page is the whole of how Meith takes
one: from the control panel, on a schedule, off the server, before an
upgrade, and by hand — and how a bundle becomes a board again.

[Disaster recovery](./disaster-recovery.md) is the runbook for the day the
server is gone; this page is what makes that runbook have something to
work with.

## What a bundle is

Every backup is one file, `meith-backup-<moment>.tar.gz`, holding:

| Member | What it is |
|---|---|
| `db.dump` | A `pg_dump` of the whole database in custom format — accounts, posts, settings, permissions, the scheduler's state, everything the board knows. |
| `uploads.tar.gz` | Avatars, attachments and board images, when the bundle carries them (see [Uploads](#what-the-bundle-carries)). |
| `manifest.json` | When it was taken, by which version, from which file driver, and the keys of any objects the backup could not read. |

The bundle deliberately does **not** contain the environment: `.env`, or
the secrets a panel generated. `AUTH_SECRET` in particular seals every
member's two-factor secret and every sealed credential in the board's
settings, so a restore on a machine with a different `AUTH_SECRET`
strands both. Keep a copy of the environment wherever you keep the
bundles; [What recovery consumes](./disaster-recovery.md#what-recovery-consumes)
prices each secret.

## The Backups screen

**Admin → System → Backups** is one screen with everything on it:

- **Back up now** queues a run. The worker picks it up on its next pass,
  a minute or two later, and runs it beside the board without stopping
  it; a large board takes a few minutes, and the screen shows the run
  once it starts. Pressing the button twice queues nothing extra: the
  database itself allows one queued and one running backup at a time.
- **Schedule and retention** summarises the settings below and links to
  them, with the next scheduled moment.
- **Off-site destination** says whether bundles are also shipped
  somewhere, where the credential came from, and has a button that
  lists the bucket to prove the credential works.
- **Bundles** lists every bundle on the server and at the destination,
  newest first, with its size in each place. **Download** streams a
  server copy, or hands you a short-lived signed link when the bundle
  exists only off-site; **Delete** removes it from both places after a
  confirmation.
- **Recent runs** is the log: what asked for the run — the panel, the
  schedule, the migrator, or the CLI — when, the bundle it wrote, its
  size, whether it shipped, and the error when it failed.

Two rules the screen enforces. Downloading a bundle asks for a fresh
password, the way every destructive action in the panel does, because the
bundle is the entire board; if it has been more than fifteen minutes since
you confirmed yours, the screen says so and the download waits. And a
board running on in-memory sample data, or on serverless functions, has
nothing to back up from here — the screen says which, and the
[serverless section](#deployments-and-where-the-backups-run) says what to
do instead.

A failed run is a failed scheduled task: it shows on **Admin → System**
under the task named *Take due backups*, and administrators are notified
the way they are for any failing task. A run that wrote its bundle but
could not ship it is recorded as failed **with the bundle's name**, so the
bundle in the ring is accounted for; nothing is pruned after such a run.

A run heartbeats every thirty seconds while it works, and each heartbeat
also renews the ten-minute lease the worker holds on the *Take due
backups* task. A run whose heartbeat is more than five minutes old — the
worker was killed by a redeploy mid-dump — is marked failed on the next
pass, its lease lapses within ten minutes, and the next backup goes
ahead. A restore does the same at once to any run the dump caught
mid-flight and to every task lease in the dump, because every bundle
carries the rows of the very run that produced it.


## Schedule, retention and uploads

The settings live under **Admin → Settings → Backups**, and the running
board reads them — no redeploy, no cron to edit.

| Setting | What it does |
|---|---|
| **Automatic backups** | Off, every day, or every week. |
| **Time of day** | When the run starts, as a 24-hour clock in **UTC**. Pick the board's quietest hour. |
| **Day of the week** | For a weekly schedule. A manual backup taken in the same minute as the slot does not stand in for the scheduled one; both are taken. |
| **Backups to keep** | How many of the newest bundles survive a run — on the server and at the destination alike. 7 unless changed. |
| **Days to keep a backup** | An age limit on top of the count. 0 means none. The newest bundle always survives. |
| **Uploads in the bundle** | *Automatic*, *always* or *never* — see below. |
| **Back up before migrating** | Take a bundle before the migrator applies a pending migration — see [Before an upgrade](#before-an-upgrade). |

Pruning happens only after a new bundle is safely written, so a run that
fails never eats the good ones: a week of failed backups leaves the last
good bundles untouched rather than eating them one night at a time. It
matches the bundle name pattern exactly and touches nothing else in the
directory.

Retention is also the disk knob. A bundle that carries the uploads is
roughly the size of the board, so seven bundles is roughly seven times the
board's data; lower the count rather than dropping the uploads.

### What the bundle carries

Whether the uploads go into the bundle depends on where they live, and
*Automatic* makes the choice this table makes:

| `FILESTORE_DRIVER` | Automatic | Why |
|---|---|---|
| `local` | includes the directory | The volume is on the same disk as the database; the bundle is the copy. |
| `blob` | includes the store | A Vercel Blob store has no backup story you can drive yourself; a bundle that skipped it would silently lose the attachments. |
| `s3` | skips the bucket | A bucket has its own backup story and is yours already. Set *Always include* for a bundle that stands alone. |

A bundle without the uploads restores a board whose posts have broken
images. The Backups screen says which the settings amount to.

### When a bundle is incomplete

On `s3` and `blob` the uploads are pulled object by object, and an object
whose key the board cannot use — one that would escape the staging
directory, one holding a `.` or `..` segment, an empty segment, surrounding
whitespace, or a control character — cannot be written into the bundle.
Such a key is not something the board itself produces; it arrives when
something else writes into the same bucket, or when a key is mangled in a
migration between stores.

The backup **skips that object and finishes the run**. A bundle missing
one attachment is worth having; a bundle that does not exist is not. The
run is then recorded as *done, incomplete* with the count of skipped
objects, the manifest carries the keys, and a restore prints them back. On
the command line the same run exits **2**.

Do not retry expecting a different result: the keys are unusable in the
store, so the next run skips exactly the same objects. The repair is in
the store — rename or remove the offending objects — and the next run
carries them.

## Off-site

A ring on the server protects against a bad upgrade or a deleted forum,
not against losing the server. Name a destination and every bundle is
also shipped there, pruned there under the same retention rules, listed
and downloadable from the same screen, and offered by the installer on a
fresh machine. Two kinds of destination are supported:

- **An S3-compatible bucket** — Backblaze B2, Cloudflare R2, Hetzner,
  Scaleway, MinIO on a machine you trust: a few euro a month at forum
  size. **A bucket of its own**, never the bucket the uploads live in, or
  a backup of the uploads sits where losing the uploads loses it too.
  Give the credential only what it needs — write, list and delete on that
  bucket alone.
- **A WebDAV folder** — Nextcloud, ownCloud, a Hetzner Storage Box,
  anything that speaks WebDAV over HTTPS. The address is a folder that
  already exists (on Nextcloud, something like
  `https://cloud.example/remote.php/dav/files/<user>/board-backups/`);
  bundles are written into it and the oldest pruned from it, and the
  folder itself is never created or removed. Use an app password made
  for this purpose rather than the account's own. Downloads of a bundle
  that exists only there stream through the board, since a WebDAV
  server has no signed links to hand out. Give the address the server
  actually serves: a redirect — `http://` to `https://`, or a folder
  without its trailing slash — is reported with the address it points
  at rather than followed, so credentials never cross one. A server that
  goes silent for two minutes fails the run rather than holding the
  worker's lane.

There are two places the destination can come from, and the environment
wins:

- **The board settings**, under **Admin → Settings → Backups**: pick the
  destination, then fill in the bucket fields or the WebDAV fields. The
  bucket's secret key and the WebDAV password are stored sealed under
  `AUTH_SECRET` — the database row holds ciphertext, so a copy of the
  database alone, a bundle included, cannot read it — which is one more
  reason `AUTH_SECRET` has to survive a restore. Change it, press
  **Test the destination**, and the next run ships.
- **The environment**: for a bucket, `BACKUP_S3_BUCKET`,
  `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY_ID` and
  `BACKUP_S3_SECRET_ACCESS_KEY` — plus `BACKUP_S3_ENDPOINT` for anything
  that is not AWS itself (with `BACKUP_S3_REGION=auto` for R2) and
  `BACKUP_S3_PREFIX` to share one bucket between boards; all four required
  values or none. For a folder, `BACKUP_WEBDAV_URL`, with
  `BACKUP_WEBDAV_USERNAME` and `BACKUP_WEBDAV_PASSWORD` together or not at
  all. One kind or the other, never both. A partial set fails the backup
  run, loudly, and never affects the board itself. When these are set the
  settings fields are stored but inert, and the settings screen says so.
  This is the right choice when the credential must not live in the
  database — and the only choice the installer can use, because a fresh
  board has no settings yet.

The compose files forward the `BACKUP_S3_*` and `BACKUP_WEBDAV_*`
variables into every container that takes a backup — web, worker and
migrate — so a value set in `.env`, or on a Coolify resource's
**Environment Variables**, reaches all three.

## Before an upgrade

Migrations are forward-only; the backup is the only way back, which makes
it the rollback plan rather than a precaution
([Upgrading](./upgrading.md#take-a-backup-first)). **Back up before
migrating** makes the migrator take that backup itself: when it finds a
pending core migration on an installed board, it writes a bundle into the
ring, ships it off-site, records the run as *before a migration*, and only
then migrates. If the backup fails the migration is refused and the old
code keeps serving — a migration without its restore point is the failure
the setting exists to prevent.

It is off by default because it asks something of the deployment: the
`migrate` container needs the backup directory, the uploads and the
`BACKUP_S3_*` variables, which the shipped compose files give it. Turn it
on once your deployment carries this release's compose file. `meith
migrate` and `meith upgrade` honour the setting the same way the
container does.

## Where the bundles live

The ring is the directory `BACKUP_DIR` names — `/backups` in the shipped
image, `./.backups` outside a container. The compose files mount a named
`backups` volume there on `web`, `worker` and `migrate`, so the ring
survives every redeploy and every process that takes a backup writes into
the same place the panel lists. Its own volume, rather than a corner of
`uploads`, so a backup of the uploads never contains older backups of
itself.

### Deployments, and where the backups run

| Deployment | Who takes the backup | Notes |
|---|---|---|
| [Docker Compose](../../getting-started/deployment/docker-compose.md), [Coolify](../../getting-started/deployment/coolify.md) | The `worker` container, in a lane of its own | The tick keeps relaying mail while a dump runs. |
| A board scaffolded by `create-meith` | The `web` container, inside the tick | The scaffold drives the tick by calling `/api/system/tick`, so the backup runs there; other tasks go on being served by the following ticks. |
| [Vercel](../../getting-started/deployment/vercel.md) | Nobody, from the panel | A function has no `pg_dump` and no disk. The Backups screen says so; take bundles with the CLI from any machine holding the project's variables — the Vercel guide has the command — and they appear on the screen once they reach the off-site destination. |

A backup started from the panel runs beside the board and never stops it.
The dump holds a consistent snapshot; members keep posting.

## From the command line

`meith backup` is the same code the panel runs, for a cron you would
rather own, a Coolify **Scheduled Task**, or a one-off before something
risky. It records its run on the Backups screen like any other, ships to
the destination the board is configured with — the environment first,
the board settings otherwise — and prunes under the board's retention
unless `--keep` says otherwise.

```sh
mkdir -p backups
docker compose run --rm --no-deps --user "$(id -u):$(id -g)" -v "$PWD/backups":/backup web \
  meith backup --out /backup/board.tar.gz
```

**Neither the `mkdir` nor the `--user` is optional**, for the same reason
`board:eject` needs them (see
[the marketplace](../../customization/marketplace.md#moving-to-a-custom-board)).
The image runs as a fixed, non-root account — `nextjs`, uid 1001 — which
owns nothing on your host, so it can only write into a directory that
account can already write to. Without them the run ends in `EACCES:
permission denied`, saying which directory needs write access and
pointing back here.

`backup` claims its destination as its first act — creating the file,
empty and mode `0600`, before it connects to the database — so a path it
cannot write is refused in under a second rather than after a dump that
may take minutes. It **never writes over an existing file**; a run killed
part-way through can leave an empty or truncated file at the path it had
claimed, and the next run refuses that path by name. Such a file is not a
backup and is safe to delete.

The flags:

| Flag | Effect |
|---|---|
| `--out <path>` | One file, refused if anything is there already. |
| `--dir <dir>` | A timestamped bundle into a ring, pruned after the write to the newest `--keep`. `--dir /backups` is the panel's own ring. |
| `--keep <n>` | Bundles to keep, in the ring and at the destination. The board's *Backups to keep* and *Days to keep a backup* unless set; 7 when the board cannot be asked. |
| `--uploads include\|skip` | Override the [automatic choice](#what-the-bundle-carries). |

Exit codes: **0** the bundle is complete; **2** the bundle was written and
is missing objects it names; anything else the backup failed and there is
no bundle. A job that treats non-zero as failure raises a `2`, which is
the intent — but a `2` is not a reason to discard the bundle.

Two commands close the loop with the destination:

```sh
meith backup:list                # the ring at BACKUP_DIR, and the bucket
meith backup:fetch meith-backup-2026-09-01T02-00-00Z.tar.gz
```

`backup:list` prints the ring and what the bucket actually holds — run it
after the first shipped backup, because an upload nobody has listed is a
hope, not an off-site copy. `backup:fetch` downloads one bundle back,
which is how a recovery on a fresh machine reaches its backup without
`scp`: set the same `BACKUP_S3_*` values there and fetch.

The dump connects over `DIRECT_DATABASE_URL` when it is set and over
`DATABASE_URL` when it is not, the same as `meith migrate`.

## Restoring

A restore only ever writes into an empty board. That is the rule under
both routes, and it is what makes a restore safe to attempt: a bad bundle
cannot become two lost boards.

### From the installer

A fresh deployment — a new server, a fresh Coolify resource, the compose
stack brought up against an empty database — serves `/install`, and that
page offers **Or restore a backup** beside the ordinary install form. It
lists every bundle in the ring and every bundle at the off-site
destination the environment names, newest first; pick one, confirm you
hold the `AUTH_SECRET` the board ran with, and press **Restore this
bundle**.

The restore replaces the empty schema the migrator just wrote with the
dump, applies any migrations the bundle predates, puts the uploads back
where the deployment's own `FILESTORE_DRIVER` says they go — the local
volume, or a bucket if `FILESTORE_DRIVER=s3` — and seals the installer,
because the restored board is installed. It refuses a board with members,
so it cannot be pointed at a live board by mistake; it refuses a
bundle taken by a newer version than the code that is running, because
migrations are forward-only; and it refuses a local uploads directory
that is not empty **before it touches the database**, so a redeploy that
kept the `uploads` volume is told to empty it and nothing has changed.

Then **restart the web and worker containers**, so nothing holds a
connection from before the restore, and sign in with an account from the
restored board. The schedule, the retention and the destination came back
with the settings; if the destination was in the environment, it is
already there.

A large board takes minutes and the page waits for it — do not reload.
Everything that can be checked is checked before the dump goes in, so a
refusal leaves the empty board as it was and the restore can be run
again. The two steps after the dump — the migrations it predates, and the
uploads — are the ones that can still fail; if one does, the page says
exactly that: the database is restored, the installer is sealed, and what
is left is to put the uploads back by hand from the `uploads.tar.gz`
inside the bundle, or to run `meith migrate` once the cause is fixed.

### From the command line

`meith restore` is the same operation for a shell, and the one to use for
a rehearsal into a scratch database beside the live one:

```sh
RESTORE_DATABASE_URL=postgres://… meith restore <bundle.tar.gz> [--uploads-dir <dir>] [--skip-uploads]
```

It refuses to run without `RESTORE_DATABASE_URL` and refuses any database
that already holds tables, so it cannot be aimed at the live board by
accident. It applies the migrations the bundle predates, prints the
restored post count — the number that tells you the bundle is real — and
puts the uploads back the way the installer does, or into `--uploads-dir`,
or nowhere with `--skip-uploads`. A bundle at the destination comes back
with `backup:fetch` first; `restore` reads local files only. It needs
`tar`, `pg_restore` and `psql` on the machine; GNU, busybox and BSD tar
(macOS) all work.


A bundle whose manifest records skipped objects restores normally, and the
restore names those objects as it finishes. Posts referring to them have
broken images, and no other copy of them exists.

## Rehearse it

A backup nobody has restored is a file, not a backup. Once, on a scratch
server or into a scratch database, restore last week's real bundle and
open a thread with attachments —
[the Coolify guide](../../getting-started/deployment/coolify.md#7-prove-the-restore)
walks through the ten-minute version in a panel terminal, and
[Disaster recovery](./disaster-recovery.md#rehearse-it-and-write-the-number-down)
asks you to time the full one. A useful policy records frequency,
retention, off-server location, access ownership, and the last successful
restore rehearsal.
