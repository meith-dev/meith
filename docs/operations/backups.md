# Back up and restore a board

Protect the database, uploaded files and deployment secrets. A backup bundle covers data; it does not contain the environment. Use [Disaster recovery](disaster-recovery.md) when replacing a lost server.

## Know what a bundle contains

A `meith-backup-….tar.gz` bundle contains `db.dump`, `manifest.json` and, when included, `uploads.tar.gz`. Read the manifest to check the originating version, file driver and any missing objects.

| Upload driver | Automatic inclusion |
|---|---|
| `local` | Included |
| `blob` | Included |
| `s3` | Skipped; select Always include for a self-contained bundle |

An S3 bucket still needs its own recovery plan when excluded. A database-only restore cannot recreate missing attachments.

Keep the original `AUTH_SECRET` and other credentials separately. Losing `AUTH_SECRET` prevents decryption of sealed settings and enrolled authenticator secrets.

## Schedule backups

1. Open **Admin → Settings → Backups**.
2. Choose daily or weekly backups and a time in UTC.
3. Set count and age retention. Zero age means no age limit; the newest bundle is retained.
4. Choose whether uploads are included.
5. Configure and test an off-site destination.
6. Open **Admin → System → Backups**, request a backup and inspect its completed run.

Backups need a running worker. The screen records pending, running, completed and failed work. A successful local file with a failed off-site upload is still a failed run to investigate. Retention pruning does not discard the last good backups after a failed run.

Off-site storage can use supported S3-compatible or WebDAV destinations. Configure through the panel or the appropriate `BACKUP_S3_*`/`BACKUP_WEBDAV_*` environment values. Environment credentials take precedence where supported. Use the destination test and actually list or fetch a saved bundle.

## Configure an off-site destination

Choose one destination. These variables are separate from the upload-store credentials:

| Destination | Required values | Optional values |
|---|---|---|
| S3-compatible | `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | `BACKUP_S3_ENDPOINT`, `BACKUP_S3_PREFIX` |
| WebDAV | `BACKUP_WEBDAV_URL` pointing to a collection | `BACKUP_WEBDAV_USERNAME` and `BACKUP_WEBDAV_PASSWORD`, supplied together |

A configured environment destination takes precedence over the saved destination. Incomplete credentials or simultaneous S3 and WebDAV destinations are rejected. Use HTTPS for remote WebDAV storage. A prefix separates this board's bundles within a shared bucket.

## Take a manual backup

From a generated board checkout with its production environment deliberately selected:

```sh
npm run meith -- backup --out /secure/backups/board.tar.gz --uploads include
```

The parent directory must exist and be writable. The output path must not already exist. Use a new filename for each manual backup.

For a Compose deployment, mount a host destination and use the host user's permissions:

```sh
mkdir -p backups
docker compose run --rm --no-deps --user "$(id -u):$(id -g)" -v "$PWD/backups":/backup web \
  meith backup --out /backup/board.tar.gz --uploads include
```

The dump uses `DIRECT_DATABASE_URL` when provided. `--dir` writes a timestamped ring; `--keep` overrides retention and `--uploads include|skip` overrides inclusion. See `meith backup --help` for the installed version.

Exit 0 means complete. Exit 2 means a bundle was written but its manifest lists missing objects. Preserve that bundle, investigate the named objects, and take a complete backup after repair. Other failures need investigation; an empty or truncated claimed output file is not a usable backup.

## Restore into a separate destination

> [!CAUTION]
> Restore into an empty destination. Keep the live board and original backup intact until the restored board has passed verification.

For a fresh deployment, unlock `/install` and choose its restore flow. Select a local or off-site bundle, confirm that you retained the original `AUTH_SECRET`, and follow the checks. The installer refuses a populated board and unsupported newer backups.

For a CLI restore, set `RESTORE_DATABASE_URL` to the empty destination, then run the installed CLI with the correct destination file-store environment:

```sh
npm run meith -- restore /secure/backups/board.tar.gz --uploads-dir /restore/uploads
```

The explicit restore database variable is required; `DATABASE_URL` alone is not an instruction to overwrite the live board. Verify whether the bundle carries uploads and whether the destination uses local or remote storage before choosing flags.

## Rehearse and verify

Start the restored board privately. Check member sign-in, a private forum, a long thread, attachments, avatars and sealed settings. Confirm the expected version and counts. Record the elapsed recovery time and the result.

Serverless deployments run backups and restores from an external machine with the required database tools and storage access. The admin backup process is unavailable inside those functions.

Before an upgrade, take a fresh backup. **Back up before migrating** can require one before pending core migrations, but this does not replace a tested recovery procedure.
