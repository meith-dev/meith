# Scheduled tasks

A PostgreSQL board needs continuing scheduling for notifications, indexes, expiry and backups.

| Deployment | Scheduler |
|---|---|
| Generated Compose/Coolify | Worker calls the web tick |
| Meith monorepo | `apps/worker` runs scheduler loops |
| Function hosting | Cron calls `/api/system/tick` |

## HTTP tick

Set `TICK_SECRET` or `CRON_SECRET` to an independent secret of at least 32 characters. Give the scheduler the same credential through its secret store.

```sh
curl --fail-with-body \
  -H "Authorization: Bearer $TICK_SECRET" \
  https://board.example/api/system/tick
```

`X-Tick-Secret` is also accepted. Query-string secrets are rejected. Run every minute for responsive processing; each task checks its own due time. A sparse schedule delays delivery and may miss time-sensitive reminders. The Vercel template starts with a daily schedule.

| Response | Meaning |
|---|---|
| `200`, `ok: true` | No reported task failures |
| `200`, `ok: false` | Inspect failed entries in `ran` and logs |
| `404` | Missing/incorrect credential |
| `503` | No durable scheduler, including fixture mode |

## CLI and verification

From the board directory:

```sh
npm run meith -- task:list
npm run meith -- task:run
```

A manual run does not replace production scheduling. Check **Admin → System**, task timestamps, queue depth and a test notification. Generated HTTP-worker task logs are in web. See [Monitoring](monitoring.md).
