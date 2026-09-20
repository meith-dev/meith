# Move from Vercel to a server

Rehearse the move before changing public routing. Keep the source deployment, database and upload store until the destination is verified.

## Export

From a board checkout with production service credentials and PostgreSQL client tools:

```sh
npm run meith -- backup --uploads include
```

Use `DIRECT_DATABASE_URL` for the dump. Explicit upload inclusion creates a self-contained bundle for local, S3 or Blob storage. An external Blob command needs a supported read-write token; it cannot use the deployment's OIDC identity.

Check exit status and manifest. Exit 2 names missing objects; repair and repeat before retiring the source. Copy the bundle outside the source hosting account. Save the original `AUTH_SECRET` and remaining environment separately.

## Restore

1. Recreate the same board version using [Compose](docker-compose.md) or [Coolify](coolify.md).
2. For CLI restore, start PostgreSQL alone with `docker compose up -d postgres`. Do not run core migrations or installation first.
3. Set `RESTORE_DATABASE_URL` to the empty target and configure destination uploads. Follow [Restore](backups.md#restore-into-a-separate-destination). Included files retain their keys when moved from Blob to local or S3 storage.
4. Alternatively, start the full fresh deployment and use the installer's restore flow, which accepts an uninstalled schema.
5. Verify sign-in, private forums, old/recent posts, uploads, sealed settings, mail and scheduled work privately.

## Cut over

Stop source writes for the final export and restore. Switch DNS/proxy routing after checks pass. Use the destination worker with `TICK_SECRET`; disable the old cron. Verify HTTPS and task progress externally.

Configure destination off-site backups and retain the source until recovery is proven. Deleting a source upload store before verification can permanently lose attachments. See [Disaster recovery](disaster-recovery.md).
