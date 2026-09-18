# Recover after losing a server

Restore a board on a replacement server. You need a backup, the board repository or exact engine version, upload recovery material and saved deployment secrets. Keep the replacement private until verified.

## 1. Gather the recovery material

| Material | Why it is needed |
|---|---|
| Database bundle | Accounts, posts, permissions, settings and task state |
| Uploads or a surviving object store | Attachments, avatars and board images |
| Original `AUTH_SECRET` | Decrypt sealed credentials and authenticator secrets |
| Other deployment credentials | Access database, mail, uploads, backups and scheduler |
| Board repository and version | Recreate installed plugins, themes and compatible code |

A backup bundle does not include the environment. Exhaust secure copies before replacing a lost authentication secret; generating a different value does not decrypt the old data.

## 2. Recreate the deployment

Recover the board repository at the version used by the backup. If it is unavailable, scaffold that exact published version and restore the board's extension configuration. Follow the relevant [deployment guide](deployment.md).

Recover first and upgrade afterward. Starting with a newer release introduces a separate schema change while you are still proving recovery.

Restore the saved environment, check persistent storage and keep public DNS on the old location or a maintenance page until the new board is ready.

## 3. Restore the database and files

Use the [backup restore procedure](backups.md#restore-into-a-separate-destination). The destination must be empty. Choose the installer restore flow on a fresh deployment or the CLI with explicit `RESTORE_DATABASE_URL`.

Confirm whether uploads are inside the bundle. If the old object store survives, verify access to it; otherwise restore its objects or included files to the destination store. Do not point a recovered database at an empty bucket and assume attachments are restored.

Restart web and worker after the restore as required by the chosen deployment. Review any incomplete-bundle warnings before proceeding.

## 4. Verify privately

Check the version, expected members and forums, several old and recent threads, private-forum permissions, attachments and avatars. Test administrator and ordinary-member sign-in and the features that depend on sealed settings.

Check the public-origin setting, but avoid sending test links pointing to an unintended preview domain. Validate email delivery using a controlled account.

## 5. Cut over

When checks pass, update the public DNS or proxy route. Verify HTTPS and canonical links from an external client. Resume the intended scheduler and confirm task progress without leaving an obsolete scheduler active against the wrong deployment.

## 6. Restore protection

Enable backups and off-site shipping on the replacement. Take and verify a new bundle, record what was lost and how long recovery took, and replace obsolete deployment credentials as needed.

For partial failures, use [Troubleshooting](troubleshooting.md), [Operator commands](operator-cli.md) or [Email](mail.md). A broken mail setting does not call for restoring the entire database.
