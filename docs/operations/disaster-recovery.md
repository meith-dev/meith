# Disaster recovery

Requires the backup, matching board repository/version, uploads and saved secrets. Keep the replacement private until verified.

1. Recover the original `AUTH_SECRET`, database/store credentials, mail settings and scheduler secrets. A new authentication secret cannot decrypt old sealed data.
2. Recreate the board at the backup's version, including its themes and plugins. Upgrade after recovery.
3. Prepare persistent storage and an empty database. For CLI restore, start PostgreSQL alone; running the migration service first makes the target non-empty. The installer restore route instead accepts an uninstalled schema.
4. Follow [Restore](backups.md#restore-into-a-separate-destination). Confirm uploads are included or recover them separately. Inspect incomplete-bundle and partial-restore messages.
5. Start privately. Test administrator/member sign-in, private forums, old/recent threads, attachments, avatars, public URL, sealed settings and controlled mail delivery.
6. Switch DNS or proxy routing after verification. Check HTTPS externally and resume the intended scheduler; retire the obsolete scheduler.
7. Configure off-site backups on the replacement, verify a new bundle and record losses and recovery time.

Do not delete original data until recovery is verified. Use [Troubleshooting](troubleshooting.md) for isolated failures that do not require a full restore.
