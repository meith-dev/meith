# Environment variables

Use environment variables for infrastructure and secrets. Start from the `.env.example` emitted with your board and validate the resolved configuration with `meith env:check` using the [invocation for your deployment](operator-cli.md).

This page groups the main controls. The complete validation schema is `packages/core/src/env.ts`; generated examples include the settings relevant to their hosting route.

## Database and identity

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Runtime PostgreSQL connection; without it a development board normally selects fixture mode |
| `DIRECT_DATABASE_URL` | Direct connection for migrations and backups when the runtime URL uses a transaction-mode pooler |
| `DATA_SOURCE` | Explicit `postgres` or `fixture` override |
| `DATABASE_POOL_MAX` | Per-process database pool limit; default 3, maximum 20 |
| `AUTH_SECRET` | Signing/sealing secret; retain the original value with your recovery material |
| `APP_URL` | Public origin used for absolute links; overrides the stored board URL |
| `TICK_SECRET`, `CRON_SECRET` | Accepted secrets for the scheduled HTTP tick; generate independently from `AUTH_SECRET` |

Generate secrets with `openssl rand -hex 32`. Production PostgreSQL deployments require a protected scheduler and a durable queue. Read [Database operations](database-operations.md) before choosing pooled and direct connection strings.

## Drivers and uploads

| Variable | Choices or purpose |
|---|---|
| `QUEUE_DRIVER` | `postgres` for durable work; `memory` for non-durable fixture/development use |
| `CACHE_DRIVER` | `memory`, `next` or `redis`; multiple instances need a shared cache |
| `REDIS_URL` | Redis-compatible connection URL |
| `FILESTORE_DRIVER` | `local`, `s3` or `blob` |
| `UPLOADS_DIR` | Persistent upload directory for local storage |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | S3-compatible upload-store configuration |
| `S3_ENDPOINT`, `S3_PUBLIC_BASE_URL` | Optional endpoint and public base URL for the selected store |
| `BLOB_STORE_ID`, `BLOB_READ_WRITE_TOKEN` | Blob-store identity or credential, depending on deployment |

Check [Scaling](scaling.md) before changing storage or cache on a running board. A local directory inside a disposable container is not persistent storage.

## Mail and backups

`MAIL_DRIVER` chooses `log`, `http` or `smtp`. `log` writes messages to logs and does not deliver them. Configure sender/provider details through the installer or mail settings, or use the explicit mail environment overrides described in [Email](mail.md).

`BACKUP_DIR` selects local bundle storage. `BACKUP_S3_*` or `BACKUP_WEBDAV_*` configure an off-site destination. These credentials are distinct from the upload-store credentials. See [Backups](backups.md) for the required fields, precedence, retention and upload inclusion.

## Apply changes safely

Check which values are environment overrides and which are editable board settings. Recreate affected services after changing environment values, then run `env:check` and verify the actual feature. Keep web, worker and CLI environments consistent.

Never commit secrets or copy a production environment into an untrusted preview. Backups do not contain the environment, so store a protected recovery copy separately.
