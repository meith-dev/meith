# Monitoring & alerting

This guide is for wiring a board into whatever your organisation already uses to watch its infrastructure: what to scrape, what to alert on, and how the pieces relate to each other. It assumes the [Compose deployment](./self-hosting.md) — `web`, `worker`, `postgres`, and `migrate` running to completion.

None of this is required to run a board. Every feature here is off unless you turn it on, and a board with nothing configured still logs, still answers `/api/health`, and still drives its own container healthchecks.

## Liveness and readiness

Two endpoints answer different questions, both unauthenticated (neither returns anything an anonymous visitor could not already infer from the board being up):

- **`/api/health`** — can this process serve a request at all. Answers `{ok:true}` unconditionally once the server has bound its port. It says nothing about the database on purpose: an orchestrator that killed every web replica the moment Postgres blinked would turn a two-second blip into a two-minute outage while replicas restart and reconnect.
- **`/api/ready`** — can this *board* do its job. Reuses the same health data the admin panel's System Health page is built from (`assessScheduler`): it checks that the database answers, and that the scheduler is not `schedulerStopped` — every enabled task gone stale at once, the signal that the worker itself has died rather than one task having a bad run. Answers `200` when both hold, `503` otherwise, with the detail in the body:

  ```json
  {
    "ok": true,
    "at": "2026-08-21T12:00:00.000Z",
    "database": { "ok": true },
    "scheduler": { "ok": true, "schedulerStopped": false, "stale": 0, "failing": 0 }
  }
  ```

  `stale` and `failing` are reported for visibility but do not by themselves flip `ok` to `false` — a single misbehaving task should show up in the admin panel and its own alert (below), not restart every container in the fleet.

`docker/healthcheck.sh` — the image's own `HEALTHCHECK`, driving `docker compose ps` and `depends_on: condition: service_healthy` — calls `/api/ready` for the `web` role. This board runs a single, non-clustered Postgres, so the fleet-wide-blip risk `/api/health` is deliberately blind to does not apply to the container healthcheck the way it would behind a database with automatic failover. The `worker` role has no HTTP server to probe, so its healthcheck runs the same check as a one-shot process instead: `node apps/worker/worker.cjs --ready`, which reuses the identical database-and-scheduler check.

## Driving the tick over HTTP

The [Compose deployment](./self-hosting.md) runs `apps/worker`, a long-lived process that ticks every 60 seconds. Where no long-lived process exists — a serverless deployment, or a board whose host only offers a cron scheduler — the same tick is available over HTTP at **`/api/system/tick`**, and an external scheduler calls it on a schedule instead. Nothing else changes: the HTTP tick runs the identical `tick()` over the identical task list, and tasks claim their work through the database (see [Architecture](./architecture.md)), so an overlapping call from a retry, a second instance, or a worker still running alongside it cannot double-process anything.

`GET` and `POST` both run one tick, so a scheduler that only issues one of them works either way.

### Authenticating the caller

The endpoint accepts a shared secret in two variables, and **either one on its own protects it**:

| Variable | Presented as | For |
|---|---|---|
| `TICK_SECRET` | `Authorization: Bearer <TICK_SECRET>`, or an `X-Tick-Secret` header | Any caller: `curl`, a systemd timer, a GitHub Actions workflow, an uptime pinger |
| `CRON_SECRET` | `Authorization: Bearer <CRON_SECRET>` | [Vercel Cron](https://vercel.com/docs/cron-jobs), which sends exactly this header under exactly this variable name and cannot be told to send another |

Both are compared in constant time, and a caller presenting the wrong one — or nothing — gets a plain `404`, the same answer `/api/metrics` gives an unauthenticated scraper: the endpoint does not admit it exists.

Set whichever the scheduler in front of the board can actually send. Setting both is fine and is how a board moves from one to the other without downtime — during the overlap either is accepted. The secret is never read from the query string; a caller that puts it there is refused and told so in the log.

With **neither** set, the tick runs unauthenticated and logs a warning on every call. That is a development affordance and nothing else: in production the board refuses to boot unless at least one of the two is set, the same way it refuses to boot without `AUTH_SECRET`.

### What the answer means

```json
{ "ok": true, "ran": [ { "taskId": "outbox.relay", "status": "ran", "durationMs": 12 } ], "registered": 21 }
```

| Status | Meaning | What a scheduler should do |
|---|---|---|
| `200`, `ok: true` | Every task the tick reached ran or was skipped because it was not due | Nothing |
| `200`, `ok: false` | The tick itself completed; at least one task in `ran` has `status: "failed"` with its `error` | Nothing automatic — look at the failing `taskId` |
| `404` | The secret was wrong or absent | Fix the secret; retrying will not help |
| `503` | This board has no scheduler, because `DATA_SOURCE=fixture`. A tick needs durable, cross-instance state to guarantee a task is not run twice | Nothing; a fixture board has no work to do |

**A failed task is deliberately not an error status.** A tick that reached the tasks and ran them did its job, even when one of those tasks threw — so the response is `200` with `ok: false` rather than a `5xx`. The reason is the retry behaviour on the other side: schedulers retry non-2xx responses, and a task that fails every time it runs would turn each retry into another attempt, tight-looping a poisoned task and hammering whatever it fails against. A failing task instead surfaces where failures are meant to surface — the `system.task_failed` administrator notification, `meith_task_runs_total{status="error"}`, the admin panel's System Health page, and `/api/ready`'s `scheduler.failing` — while the scheduler simply calls again on its next scheduled tick. Only a genuinely unusable endpoint (`404`, `503`) answers outside the 2xx range.

### Cadence

Every task carries its own `intervalSeconds` and is skipped when it is not due, so calling the endpoint more often than the shortest interval costs a claim query per task and nothing else. Calling it *less* often than 60 seconds does not break anything either — tasks are written so that a missed run delays work rather than losing it — but it does stretch the latency of everything the shortest-interval tasks drive: relaying domain events onto the queue, draining that queue, and the "as it happens" subscription notifications, all of which want 60 seconds. At an hourly cadence a reply notification can be an hour late; at a daily one, a day. Nothing is lost, but "instant" stops meaning instant.

The route declares `maxDuration = 300`, so a host that reads Next.js's build output (Vercel does) allows a long tick rather than cutting it off at a default. That ceiling is chosen to cover the worst case: the per-minute tasks' own budgets — webhook delivery's 240 seconds being much the largest — can add up to roughly six minutes if every one of them runs to its limit in the same tick, and each task is aborted at its own budget regardless. A tick killed mid-run leaves its claims to expire after 15 minutes, and the next tick picks the work up.

## Metrics

Off by default. Turn it on with:

```sh
METRICS_ENABLED=1
METRICS_TOKEN=<generated, openssl rand -base64 32>
```

`METRICS_TOKEN` is required in production once `METRICS_ENABLED` is set — the board refuses to boot without it, the same way it refuses to boot without `AUTH_SECRET`. Outside production an unset token serves the endpoint unauthenticated and logs a warning, for a local Prometheus without the ceremony.

`/api/metrics` answers in the [Prometheus text exposition format](https://prometheus.io/docs/instrumenting/exposition_formats/), authenticated the same way as `/api/system/tick`: present the token as `Authorization: Bearer <METRICS_TOKEN>`, or as an `X-Metrics-Token` header for a scraper that cannot set `Authorization`. A request with `METRICS_ENABLED` off, or the wrong token, gets a plain `404` — the endpoint does not admit it exists to an unauthenticated caller.

```yaml
# prometheus.yml
scrape_configs:
  - job_name: meith-web
    metrics_path: /api/metrics
    authorization:
      credentials: <METRICS_TOKEN>
    static_configs:
      - targets: ['board.example:443']
```

### What it exposes

| Metric | Type | Labels | What it means |
|---|---|---|---|
| `meith_task_runs_total` | counter | `task`, `status` (`ok`\|`error`) | Scheduled task runs. A rising `error` rate for one `task` is the first place to look before `meith_task_run_duration_seconds`. |
| `meith_task_run_duration_seconds` | histogram | `task` | How long each scheduled task takes. Compare against `docs/performance.md`'s offline budgets when a task starts running long. |
| `meith_http_request_duration_seconds` | histogram | `method`, `route`, `status` | REST API v1 (`/api/v1/*`) request duration. `route` is the declared path template (`/threads/:id`), not the URL, so cardinality stays bounded regardless of how many distinct threads or forums are requested. |
| `meith_queue_jobs` | gauge | `status` (`queued`\|`dead`) | Jobs pending or running, and jobs in the dead-letter state, read fresh from Postgres at scrape time. |
| `meith_db_connections_active` | gauge | — | Server-side connections to this database (`pg_stat_activity`), read fresh at scrape time. |

Counters and histograms accumulate for the life of the process; the two gauges are refreshed from the database on every scrape rather than kept continuously in sync. Each web instance and the worker is its own scrape target with its own numbers — see [Scaling out](./scaling.md#what-already-scales) for what that means once there is more than one.

### What to alert on

- **`meith_queue_jobs{status="dead"}` rising** — jobs are failing every retry and landing in the dead-letter state. Not urgent by itself (nothing is silently dropped), but a queue nobody looks at is where a broken integration hides.
- **`meith_queue_jobs{status="queued"}` growing without bound** — the worker is falling behind or has stopped. Cross-check against `/api/ready`'s `scheduler.stale`.
- **`up{job="meith-web"} == 0` or repeated `/api/ready` failures** — the standard "is it up" alert, sourced from Prometheus's own scrape health or a separate uptime check against `/api/ready`.
- **A step change in `meith_task_run_duration_seconds`** for a specific `task` — the offline `pnpm perf` harness catches regressions before release; this is the same signal in production, after release.
- **`meith_http_request_duration_seconds` p95 rising** for the REST API — the question this ticket started from ("is p95 thread render getting worse") now has an answer that does not require re-running the offline harness.

None of these are wired to a specific alerting tool by design — Prometheus's own Alertmanager, Grafana alerting, or a hosted equivalent all read the same metric names.

## Tracing

Off by default, and, unlike metrics, has no companion secret to configure — a trace exporter either has a collector to talk to or it does not.

```sh
OTEL_ENABLED=1
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector.internal:4318/v1/traces
```

When enabled, the web server (in `instrumentation.ts`) and the worker (at the start of its main loop) each register an [OpenTelemetry](https://opentelemetry.io/) `NodeTracerProvider` exporting over OTLP/HTTP in batches. Two spans exist today: `task.run` around every scheduled task, and `http.request` around every REST API v1 request — both carry the same labels their metrics counterparts use (`task.id`; `http.method`, `http.route`, `http.status_code`), so a slow histogram bucket and a slow trace point at the same thing.

With `OTEL_ENABLED` unset, every call into the tracing API is a documented no-op — the OpenTelemetry SDK is imported dynamically and only constructed once the flag is on, so a board that never turns this on never pays for it beyond the dependency's presence in the image.

Nothing here replaces `docs/performance.md`'s offline harness — tracing shows *where* time went for one request in production; the harness is still how you catch a regression before it ships.

## Shipping logs

Structured JSON logs (pino, request-ID correlated, secrets redacted — see `packages/core/src/logger.ts`) go to stdout already; nothing here changes that. The Compose file caps each container's own `json-file` log driver at 10MB × 3 files, which is retention on the machine, not shipping.

To get logs into a log aggregator, point a collector at the container runtime rather than the application: [Vector](https://vector.dev/), [Promtail](https://grafana.com/docs/loki/latest/clients/promtail/) or [Fluent Bit](https://fluentbit.io/) can all tail Docker's own JSON log files or read directly from the Docker/containerd log driver, and every line is already a JSON object — no parsing rules to write. `docker compose logs --since 1h web worker`, from [Operations](./operating.md#routine-checks), remains the right tool for looking at recent logs by hand.

## Everything at a glance

| Question | Where |
|---|---|
| Is the process alive? | `/api/health` |
| Can the board do its job? | `/api/ready`, and the container healthchecks it drives |
| Can the board run scheduled work without a worker process? | `/api/system/tick`, called by a cron scheduler |
| What are current numbers? | `/api/metrics` (`METRICS_ENABLED=1`) |
| Where did this request's time go? | Tracing (`OTEL_ENABLED=1`) |
| What happened, in order? | Structured logs, shipped from the container runtime |
| Rich detail on tasks, search index, recounts, mail | The admin panel's System Health page — see the [Organiser guide](./organiser-guide.md) |
