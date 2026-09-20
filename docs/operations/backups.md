# Backups and restore

Protect PostgreSQL, uploads and the deployment environment. Bundles contain `db.dump`, `manifest.json` and optionally `uploads.tar.gz`; they do not contain deployment environment variables. Database-stored secrets remain in the dump, including sealed settings. Keep the original `AUTH_SECRET` separately to decrypt sealed settings and authenticator secrets.

## Schedule backups

1. Open **Admin → Settings → Backups**.
2. Select daily/weekly timing in UTC, count/age retention and upload inclusion.
3. Configure and test an off-site destination.
4. Request a backup under **Admin → System → Backups** and inspect completion.

A worker is required. Zero age disables age-based expiry; the newest bundle is retained. Failed off-site shipping is a failed run even if the local bundle exists. Failed runs do not prune the last good backups.

Local and Blob uploads are included automatically; S3 uploads are skipped by default. Select **Always include** for a self-contained S3 bundle.

## Off-site configuration

| Destination | Required | Optional |
|---|---|---|
| S3 | `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` | `BACKUP_S3_ENDPOINT`, `BACKUP_S3_PREFIX` |
| WebDAV | `BACKUP_WEBDAV_URL` collection URL | `BACKUP_WEBDAV_USERNAME` and `BACKUP_WEBDAV_PASSWORD` together |

Use HTTPS for remote WebDAV. Environment destinations override saved settings. Incomplete or simultaneous S3/WebDAV configurations are rejected. Backup credentials are separate from upload credentials. Verify an actual remote bundle, not only a connection test.

## Manual backup

In a board checkout configured for the intended database:

```sh
npm run meith -- backup --out /secure/backups/board.tar.gz --uploads include
```

The parent must exist; the output must not. Use a new filename each time. For Compose:

```sh
mkdir -p backups
docker compose run --rm --no-deps --user "$(id -u):$(id -g)" \
  -v "$PWD/backups":/backup web \
  meith backup --out /backup/board.tar.gz --uploads include
```

`DIRECT_DATABASE_URL` is preferred for the dump. `--dir` writes a timestamped ring, `--keep` overrides retention, and `--uploads include|skip` overrides inclusion.

Exit 0 means complete. Exit 2 means a bundle exists but its manifest names missing objects: preserve it, repair the cause and take another backup. Other failures require investigation; do not use empty or truncated files.

## Restore into a separate destination

> [!CAUTION]
> Keep the source board and backup intact. CLI restore requires an empty database; do not run migrations or installation on that destination first.

Set `RESTORE_DATABASE_URL` to the empty destination and configure its file store. Then, from a board checkout:

```sh
npm run meith -- restore /secure/backups/board.tar.gz --uploads-dir /restore/uploads
```

Use an empty upload directory. Omit `--uploads-dir` to use the destination's configured store. `DATABASE_URL` alone cannot select a restore target.

Alternatively, unlock `/install` on a fresh deployment and select its restore flow. This route can replace an uninstalled schema but refuses a board with members. Both routes reject unsupported newer backups. Restore applies missing migrations; inspect any partial-failure message before retrying against the now-populated target.

## Verify

Start privately and check accounts, private forums, old/recent posts, attachments, avatars and sealed settings. Record recovery time and results. Excluded uploads need a separate recovery copy.

Run serverless backups/restores externally with PostgreSQL tools and storage access. **Back up before migrating** can require a pre-migration backup but does not replace restore testing. See [Disaster recovery](disaster-recovery.md).
