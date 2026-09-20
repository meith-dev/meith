# Vercel configuration

Use with [Vercel deployment](vercel.md).

## Services

| Service | Configuration |
|---|---|
| PostgreSQL | Pooled runtime URL and direct migration/backup URL |
| Redis | Shared cache reachable from every function |
| Uploads | Blob or S3-compatible storage |
| Mail | Provider credentials and verified sender |
| Scheduler | Authenticated `/api/system/tick` calls |

Explicit environment values override connected-service aliases. `DATABASE_URL_UNPOOLED` and `POSTGRES_URL_NON_POOLING` can supply the direct database URL; `KV_URL` and `UPSTASH_REDIS_URL` can supply Redis. Use the template's `.env.example` and `meith env:check`; the full schema is `packages/core/src/env.ts`.

## Build and scheduling

The build runs `meith migrate` before `forum-web build --at-root`. Both preview and production builds migrate their configured database. Use the direct URL for migration locking. Keep customizations in board configuration, themes and plugins, outside generated framework directories.

The template schedules a daily tick. For more frequent work, check [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) or use an external scheduler. The tick route declares `maxDuration = 300`; check the project's [function limits](https://vercel.com/docs/functions/limitations). Verify completed work under **Admin → System**.

## Uploads and recovery

Platform request limits apply to the entire multipart request before Meith's attachment limit. Uploads and downloads also consume function memory. Test realistic sizes and private-forum downloads through the board. Verify the store's access policy separately.

Run imports, backups and restores externally with database tools, staging disk and service credentials. Local Blob access needs supported token credentials; deployment identity is not available on an operator's laptop. See [Backups](backups.md) and [Migration off Vercel](leaving-vercel.md).

Budget for each connected service and scheduler. Provider limits and prices can change.
