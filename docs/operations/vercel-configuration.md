# Vercel configuration and limits

Use this reference alongside [Deploy on Vercel](vercel.md). The board requires managed database, cache, upload and mail services because functions do not provide a persistent local server.

## Required service configuration

| Service | What to verify |
|---|---|
| PostgreSQL | Runtime pooled URL plus direct migration/backup URL |
| Redis-compatible cache | Shared access from every function instance |
| Upload storage | Blob or an S3-compatible store with the intended visibility |
| Mail | Verified sender and valid provider credentials |
| Scheduler | Authenticated tick at a cadence suitable for the board |

Meith derives supported configuration from connected-service environment variables when explicit settings are absent. Check `packages/core/src/env.ts` and the generated template's `.env.example` for the exact supported aliases. Explicit environment values take precedence; stale overrides can hide a correct connected-service value.

`DATABASE_URL_UNPOOLED` and `POSTGRES_URL_NON_POOLING` can supply a direct database URL. `KV_URL` and `UPSTASH_REDIS_URL` are recognized cache sources. Blob configuration can use the linked store identity or supported token credentials. Do not invent a fallback credential when environment resolution fails; inspect the named missing value.

## Build-time migrations

The template build command runs `meith migrate` before `forum-web build --at-root`. It materializes the framework at the project root for the hosting builder.

Both production and preview builds run the migration command against the database provided to that build. Use separate preview databases when previews must not alter production. Runtime functions use the pooled connection; migrations need the direct connection for their session-level lock.

Do not add application customizations inside generated framework directories. Use themes and plugins registered in the board's own configuration.

## Scheduler and function limits

The generated cron runs daily. More frequent work requires a scheduler plan or external caller that supports the desired cadence. Read the provider's current [cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) rather than assuming every account accepts every expression.

The tick route declares `maxDuration = 300`. Check the platform's current [function limits](https://vercel.com/docs/functions/limitations) and project settings before deployment. A declared duration is a ceiling, not evidence that a tick always finishes within it.

A sparse tick delays queued work. Use [Scheduled tasks](scheduled-tasks.md) to verify completion and inspect failures.

## Upload and storage limits

Platform request/response limits apply before Meith's configured attachment allowance. Account for the entire multipart request, not just one file. Upload and download processing also use function memory.

Verify bucket/store access policy. File credentials alone do not determine whether objects are public. Test private-forum attachments through the board rather than assuming a direct storage URL has the same authorization rules.

## Backups, imports and operator commands

Run long-lived backup, restore and import commands from an external machine or suitable job environment with access to the managed services. Keep local staging space and the required database tools available. They are not tasks to start inside an ordinary web function.

Set the correct hosted-service environment in a board checkout before running its CLI. Use [Backups](backups.md), [Import a forum](migrating.md) or [Move away from Vercel](leaving-vercel.md) for the procedure.

## Costs and verification

Budget separately for functions, database, cache, uploads, mail and scheduling, using current provider plans. Before inviting members, verify realistic uploads, mail, scheduler latency and recovery. Local tests of a driver are not a live deployment test.
