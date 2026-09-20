# Plugin settings, notifications and tasks

Access services through the runtime supplied to a handler. Database-dependent services are unavailable in fixtures.

## Settings

Declare local setting keys such as `api_key`; the host stores them under `plugin.<plugin-key>.<setting-key>`. The host provides the admin form and validation.

| Type or option | Behaviour |
|---|---|
| Secret | Empty default; write-only; a blank submitted value retains the stored secret |
| Environment override | Takes precedence over the saved value, then the default |
| Required | Reports missing configuration; does not itself block handlers |
| Select | Trims and matches case-insensitively; returns the declared casing; invalid values fall back |
| Number | Does not impose application-specific bounds; validate or clamp before use |

Setting description translation keys take no arguments. Check required configuration before invoking an external service. Never put secrets in rendered models or logs.

## Notifications

Declare each notification kind with `key`, `title`, `description` and optional `emailByDefault`/`pushByDefault` values. Members' preferences override the defaults.

Send to a specific `userId` with the declared `kind`, a subject of at most 200 characters, a body of at most 2,000 characters and a same-board `href`. Use a deduplication key for retryable work. There is no unrestricted broadcast service.

## Scheduled tasks

Choose one schedule:

| Schedule | Accepted value |
|---|---|
| Interval | At least 60 seconds |
| Cron | Five fields, interpreted in UTC |

Cron supports numeric values, ranges, lists and steps; `0` and `7` both mean Sunday. When both day-of-month and day-of-week are restricted, either match is sufficient. Impossible dates are rejected.

A cron task first runs at its next matching time, not immediately on installation. Missed runs produce one catch-up execution. Handlers must be idempotent because work can be retried after a worker fails.

The board must run the [scheduler](../operations/scheduled-tasks.md). Use **Admin → Tasks** or `task:list` to inspect execution and failures.
