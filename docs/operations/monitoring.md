# Monitor a running board

Monitor the services and background work, not just whether the home page loads. Start with **Admin → System**, then add external readiness checks and metrics where needed.

## Inspect system status

Check migration state, scheduled-task progress, failures, search-index progress and queue health. Investigate the named task before retrying it repeatedly. The panel's maintenance controls include recounting, reindexing, cleanup and pending plugin migrations.

## Check liveness and readiness

| Endpoint | What it tells you |
|---|---|
| `/api/health` | The web process can answer a request |
| `/api/ready` | The database and scheduler meet the board's readiness requirements |

A liveness success does not prove that mail, backups or queued jobs are progressing. An individual failed task can need attention even when the board remains ready. Inspect the response and system page as well as the HTTP status.

For HTTP scheduling, follow [Scheduled tasks](scheduled-tasks.md). The tick can return HTTP 200 with `ok: false` when a task failed; monitoring only the status code misses that condition.

## Enable metrics

Set `METRICS_ENABLED=1` and a separately generated `METRICS_TOKEN`, then restart the affected services. Production refuses enabled metrics without the token.

Scrape `/api/metrics` using `Authorization: Bearer <token>` or `X-Metrics-Token`. A disabled endpoint or invalid credential returns 404. Keep the token in the scraper's secret configuration.

| Metric | Use |
|---|---|
| `meith_task_runs_total` | Task successes and failures |
| `meith_task_run_duration_seconds` | Task duration |
| `meith_http_request_duration_seconds` | REST API request duration by route |
| `meith_queue_jobs` | Queued and dead-letter jobs |
| `meith_db_connections_active` | Database connection pressure |

Counters and histograms are per process. Scrape each relevant instance and aggregate rather than treating one replica as the whole board.

## Choose actionable alerts

Alert on repeated readiness failures, a growing queue with no progress, repeated task errors, missing backups and significant duration changes. Check disk space, database capacity and certificate expiry through the infrastructure tools you use.

Document who receives alerts and what they should inspect. A queue of permanent failures needs investigation; automatic repeated retries can make an upstream failure worse.

## Add tracing when diagnosing latency

Set `OTEL_ENABLED=1` and `OTEL_EXPORTER_OTLP_ENDPOINT` for your collector, then restart. The web server and worker export task and REST API request spans through OTLP/HTTP. Protect and retain telemetry according to your deployment's needs.

Tracing explains production requests; the [performance reference](../reference/performance.md) describes repeatable benchmark measurements.

## Inspect logs

In Compose, run `docker compose logs --since 1h web worker` from the deployment directory. The generated board's worker is an HTTP caller, so task execution logs are in web. Use the task name and request context to connect a symptom to its failure.

Start with [Troubleshooting](troubleshooting.md) when the board is unhealthy.
