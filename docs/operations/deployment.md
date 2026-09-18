# Choose a deployment

Choose where the board will run before creating production data. Every route needs PostgreSQL, persistent uploads, working email and a way to run scheduled work.

## Compare the supported routes

| Route | Choose it when | You manage |
|---|---|---|
| [Coolify](coolify.md) | You have a server and want a deployment panel | The server, backups and deployment settings |
| [Docker Compose](docker-compose.md) | You want direct control of containers and the reverse proxy | Containers, HTTPS, secrets, storage and updates |
| [Vercel](vercel.md) | You want functions backed by managed services | Connected services, scheduler cadence and platform limits |

For a private experiment, use a [local preview](../start/quickstart.md) or a [writable local board](local-board.md). A preview is not a production installation.

## Prepare before installing

Have a public domain, database and upload-storage plan, mail provider, and somewhere off-site to keep backups and secrets. Use the chosen guide's exact environment and command context: the Meith monorepo, a generated board checkout and a deployed container are different environments.

If you already run MyBB or phpBB, read [Import an existing forum](migrating.md) before inviting members or creating production content. Rehearse the import into an isolated destination.

## Finish the installation

The deployment guide takes you to `/install`. Complete the installer, then work through [Set up your community](../administration/first-steps.md).

Before opening registration, verify email delivery, ordinary-member permissions, scheduled tasks and a restorable backup. The [operations checklist](operating.md) covers the handover.
