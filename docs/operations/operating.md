# Operations

## Deployment checks

Verify public HTTPS, sign-in, completed migrations, scheduled-task progress, delivered test mail, uploads surviving a restart and a successful off-site restore rehearsal.

For Compose, run in the deployment directory:

```sh
docker compose ps
docker compose logs --since 1h web worker
```

Database, web and worker should run; the migration service should have exited 0.

## Procedures

| Task | Guide |
|---|---|
| CLI and account recovery | [Operator commands](operator-cli.md) |
| Settings and drivers | [Configuration](configuration.md), [Environment](environment.md) |
| Migrations and pooling | [Database](database-operations.md) |
| Delivery | [Mail](mail.md), [Scheduled tasks](scheduled-tasks.md) |
| Health and failures | [Monitoring](monitoring.md), [Troubleshooting](troubleshooting.md) |
| Data recovery | [Backups](backups.md), [Disaster recovery](disaster-recovery.md) |
| Releases and packages | [Upgrades](upgrading.md), [Extensions](installing.md) |
| Replicas | [Scaling](scaling.md) |
| Sign-in and browser policy | [Authentication](single-sign-on.md), [Security](web-security.md) |
| Browser notifications | [Web push](web-push.md) |

Record the deployed version, repository, service locations, scheduler, backup destination and last tested restore. Keep credentials, including the original `AUTH_SECRET`, securely outside the server. Backup bundles do not include them.
