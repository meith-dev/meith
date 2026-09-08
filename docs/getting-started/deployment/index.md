# Choose a deployment

Choose where the board will run. For a local preview that needs no database,
use [Try Meith locally](../quickstart.md).

## Pick your route

| Route | Use it when | You manage |
|---|---|---|
| [Coolify](./coolify.md) | You want a panel to deploy on your own server | A server, domain, board repository, and backups |
| [Docker Compose](./docker-compose.md) | You already manage Docker and a reverse proxy | Containers, secrets, HTTPS, and backups |
| [Vercel](./vercel.md) | You want the web app on managed functions | Hosted PostgreSQL, shared cache, object storage, mail, and a scheduler |

Coolify and Docker Compose run four services: PostgreSQL, a one-shot
migration service, the web app, and a worker. The scaffold's worker calls
`/api/system/tick` over HTTP; the repository's image runs the worker process.

Vercel uses a different deployment: migrations run before the build, the web
app runs in functions, and a scheduled HTTP call replaces the worker.
Read its [limits](./vercel.md#the-limits-worth-knowing-first) before choosing it.

All routes use a board repository with pinned Meith packages. The installer
at `/install` creates the first administrator and forum after migrations
have completed.

## Moving an existing forum

Follow [Migrate from MyBB or phpBB](../../guides/migrating.md) after installing
the destination board. Rehearse against copies of the source
database and uploads, and review the feature differences linked from that guide.

## After it is up

1. [Set up your community](../first-steps.md).
2. [Configure and test backups](../../guides/operations/backups.md).
3. [Check services and scheduled work](../../guides/operations/monitoring.md).

For a public, read-only sample board, deploy [fixture mode](../../contributing/development.md#fixture-mode).
