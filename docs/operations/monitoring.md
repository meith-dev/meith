# Monitoring

Check **Admin → System** for migrations, task failures, queue state and search progress.

## Health

| Endpoint | Check |
|---|---|
| `/api/health` | Web process responds |
| `/api/ready` | Database and scheduler readiness |
| `/api/system/tick` | Task execution; HTTP 200 can still contain `ok: false` |

Readiness fails when enabled `outbox.relay` or `queue.drain` tasks are stale
(three of their own intervals since the last run), or have never run. Healthy
daily tasks cannot mask a stalled critical lane. The age check also applies when
a task is labelled failing after repeated errors. Disabled tasks and tasks holding
a live execution lease do not trigger this condition. Other stale or failing
tasks remain visible individually under **Admin → System**. This assessment is
shared by web readiness and the standalone worker readiness command. A daily-only
cron schedule does not keep one-minute delivery tasks ready between ticks.

Read response bodies and task results. A working home page does not prove background delivery or backups work.

## Metrics

Set `METRICS_ENABLED=1` and a separate `METRICS_TOKEN`, then restart. Production requires the token. Scrape `/api/metrics` with `Authorization: Bearer <token>` or `X-Metrics-Token`; disabled or unauthorised requests return 404.

| Metric | Meaning |
|---|---|
| `meith_task_runs_total` | Task success/failure counts |
| `meith_task_run_duration_seconds` | Task duration |
| `meith_http_request_duration_seconds` | REST latency by route |
| `meith_queue_jobs` | Queue and dead-letter depth |
| `meith_db_connections_active` | Database connection use |

Counters and histograms are per process. Scrape and aggregate relevant instances. Alert on stalled queues, repeated failures, missing backups, disk/database capacity and certificate expiry.

## Traces and logs

Set `OTEL_ENABLED=1` and `OTEL_EXPORTER_OTLP_ENDPOINT` for OTLP/HTTP task and REST traces.

For Compose, run `docker compose logs --since 1h web worker`. Generated workers call HTTP; execution logs are in web. Use [Troubleshooting](troubleshooting.md) to diagnose failures and [Performance](../reference/performance.md) for benchmarks.
