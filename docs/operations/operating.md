# Server operations

Use this checklist when you take responsibility for a running board. Community settings and moderation are covered in [Community administration](../administration/organiser-guide.md); this page is about keeping the services and data working.

## Check a deployment

1. Open the public HTTPS address and sign in with a test account.
2. Confirm the database is reachable and the core migration step completed successfully.
3. Confirm scheduled work runs. Pages can load while queued work is stalled.
4. Send a test email and check the receiving mailbox.
5. Upload a test attachment and confirm it survives a restart.
6. Verify an off-site backup and rehearse a restore.

For a Compose deployment, run from the directory containing its Compose file:

```sh
docker compose ps
docker compose logs --since 1h web worker
```

The PostgreSQL, web and worker services should be healthy; the one-shot migration service should have exited successfully. Service names and worker implementation depend on the deployment files you use.

## Find the maintenance task

| Task | Guide |
|---|---|
| Run a CLI command or recover administrator access | [Operator commands](operator-cli.md) |
| Change a runtime setting or driver | [Board configuration](configuration.md) and [environment variables](environment.md) |
| Apply migrations or configure pooled connections | [Database operations](database-operations.md) |
| Configure outgoing email | [Email](mail.md) |
| Run the worker or a scheduled tick | [Scheduled tasks](scheduled-tasks.md) |
| Diagnose readiness, logs or alerts | [Monitoring](monitoring.md) |
| Take, copy or test a backup | [Backups](backups.md) |
| Install a release | [Upgrade Meith](upgrading.md) |
| Replace a lost server | [Disaster recovery](disaster-recovery.md) |
| Run more web instances | [Scaling](scaling.md) |
| Add an extension | [Install plugins and themes](installing.md) |
| Configure sign-in providers | [Authentication settings](single-sign-on.md) |
| Enable browser notifications | [Web push](web-push.md) |

If something is failing, start with [Troubleshooting](troubleshooting.md). The [cookies and headers reference](web-security.md) covers browser security behavior.

## Keep a recovery handover

Record the deployed version, board repository, hosting route, database, upload store, backup destination and scheduler. Store secrets securely outside the server, including the original `AUTH_SECRET`; backup bundles do not contain the environment.

Record the date and result of the most recent restore rehearsal. A backup file's existence alone does not prove the board can be recovered.
