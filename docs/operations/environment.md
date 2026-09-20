# Environment variables

Start from the board's `.env.example`. Run `npm run meith -- env:check` in the board directory; use [container invocations](operator-cli.md) for deployed checks. The complete schema is `packages/core/src/env.ts`.

## Database and identity

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Runtime PostgreSQL URL; absent in a fixture preview |
| `DIRECT_DATABASE_URL` | Direct migration and backup connection |
| `DATA_SOURCE` | Explicit `postgres` or `fixture` |
| `DATABASE_POOL_MAX` | Connections per process; default 3, maximum 20 |
| `AUTH_SECRET` | Signing/sealing secret; retain the original for recovery |
| `APP_URL` | Public origin; overrides saved board address |
| `TICK_SECRET`, `CRON_SECRET` | HTTP scheduler credentials, separate from `AUTH_SECRET` |

Generate secrets with `openssl rand -hex 32`. Production PostgreSQL requires a protected scheduler and durable queue. See [Database operations](database-operations.md).

## Drivers

| Variable | Values or purpose |
|---|---|
| `QUEUE_DRIVER` | `postgres` for durable work; `memory` for fixtures/development |
| `CACHE_DRIVER` | `memory`, `next`, `redis` |
| `REDIS_URL` | Shared cache URL |
| `FILESTORE_DRIVER` | `local`, `s3`, `blob` |
| `UPLOADS_DIR` | Persistent local upload directory |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Upload bucket credentials |
| `S3_ENDPOINT`, `S3_PUBLIC_BASE_URL` | Optional upload-store endpoints |
| `BLOB_STORE_ID`, `BLOB_READ_WRITE_TOKEN` | Blob identity or token |

Multiple instances need [shared cache and uploads](scaling.md). Changing a driver does not move files.

## Mail and backups

`MAIL_DRIVER` accepts `log`, `http` or `smtp`; `log` does not deliver. See [Mail](mail.md) for provider fields and override rules.

`BACKUP_DIR` selects local bundle storage. `BACKUP_S3_*` and `BACKUP_WEBDAV_*` configure separate off-site credentials; see [Backups](backups.md).

Restart affected services after environment changes and verify the feature. Keep secrets outside git and separate from data backups, which do not include the environment.
