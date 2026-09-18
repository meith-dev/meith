# Run scheduled tasks

Scheduled work delivers queued notifications, maintains indexes, expires restrictions and performs other background jobs. A PostgreSQL-backed board needs a worker or an authenticated HTTP scheduler.

## Choose one scheduling route

| Deployment | Scheduler |
|---|---|
| Generated Compose/Coolify board | Its worker container calls the web tick endpoint |
| Meith monorepo worker process | `apps/worker` runs scheduler loops directly |
| Function hosting | An external or hosting-provided cron calls `/api/system/tick` |

Use the worker shipped with your deployment where possible. A fixture board has no durable scheduler and returns 503 from the tick endpoint.

## Call the HTTP tick

Configure `TICK_SECRET` or `CRON_SECRET` in the board environment and a matching credential in the scheduler. Generate at least 32 characters and keep the secret out of the URL.

```sh
curl --fail-with-body   -H "Authorization: Bearer $TICK_SECRET"   https://board.example/api/system/tick
```

Replace the origin and provide the secret from the scheduler's secret store. The endpoint also supports `X-Tick-Secret`; query-string secrets are not accepted.

A minute cadence keeps the shortest-interval work responsive. Each task decides whether it is due. A less frequent tick delays processing; some time-sensitive features, such as reminders for an event that already started, cannot be made timely by catching up afterward.

The Vercel template's daily schedule is a deployment starting point, not a promise of instant notifications. Choose a supported more frequent schedule when required.

## Read the result

| Result | Meaning |
|---|---|
| `200`, `ok: true` | Tick completed without reported task failures |
| `200`, `ok: false` | One or more tasks failed; inspect `ran` and the named task |
| `404` | Missing or incorrect scheduler credential |
| `503` | No durable scheduler, such as fixture mode |

Do not retry a permanently failing task in a tight loop. Inspect **Admin → System** and logs, repair the cause, and allow the scheduler or a deliberate maintenance run to retry.

## Run maintenance from the CLI

Use the invocation for your board from [Operator commands](operator-cli.md):

```sh
meith task:list
meith task:run
```

Use the installed command's help before selecting a specific task. A manual run is a diagnostic tool, not a replacement for a continuing production scheduler.

## Verify progress

Check task timestamps, queue depth, search-index progress and a controlled notification. An HTTP worker can be healthy and quiet; verify completed work in the web logs and system page. [Monitoring](monitoring.md) covers readiness and alerts.
