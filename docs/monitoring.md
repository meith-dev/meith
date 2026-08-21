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
| What are current numbers? | `/api/metrics` (`METRICS_ENABLED=1`) |
| Where did this request's time go? | Tracing (`OTEL_ENABLED=1`) |
| What happened, in order? | Structured logs, shipped from the container runtime |
| Rich detail on tasks, search index, recounts, mail | The admin panel's System Health page — see the [Organiser guide](./organiser-guide.md) |
