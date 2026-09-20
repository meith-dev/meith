# Deployment

A production board needs PostgreSQL, persistent uploads, email and scheduled tasks.

| Route | Requirements |
|---|---|
| [Coolify](coolify.md) | Server, domain and Git repository; deployment through a panel |
| [Docker Compose](docker-compose.md) | Server, Docker, HTTPS proxy and deployment access |
| [Vercel](vercel.md) | Managed database, cache, uploads, mail and HTTP scheduler |

For development, use a [preview](../start/quickstart.md) or [writable local board](local-board.md).

Prepare a public domain, credentials and off-site backups. To move an existing forum, rehearse the [import](migrating.md) before creating production content.

After deployment, complete `/install` and the [community setup checklist](../administration/first-steps.md). Verify mail, member permissions, scheduled tasks and a restore before opening registration.
