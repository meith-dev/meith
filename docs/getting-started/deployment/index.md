# Deployment

A production Meith board is four services, whichever route puts them
there:

- **PostgreSQL** stores everything the community makes.
- **A one-shot migration service** updates the schema, and finishes
  before anything else starts.
- **The web service** answers browsers and the API.
- **The worker** runs scheduled and queued work once a minute — or, for a
  board scaffolded outside this repository, a small loop that drives the
  same work over HTTP instead, since the compiled worker process is not
  something such a board depends on today.

Every route below deploys that same shape, starting from the same
scaffold — `npx create-meith` or [the
template](https://github.com/meith-dev/template) — and ends the same way:
open `/install` on the new board to name it and create its first
administrator. Building the image on the server is the default and the
fastest way to a first deploy; a low-spec machine can instead pull one
built elsewhere, and each route below says how.

## Pick your route

| Route | For | You need |
|---|---|---|
| [Coolify](./coolify.md) | Most boards — the guided route | A rented server and a domain; no terminal required after setup |
| [Docker Compose by hand](./docker-compose.md) | Operators who already run a proxy | Docker Compose, a `.env` you write, a reverse proxy you operate |
| [Vercel](./vercel.md) | Boards that would rather not have a server | A Vercel account and a hosted Postgres; the worker becomes a cron tick |

If you only want something the public can poke,
[demo mode](../../guides/operations/demo-mode.md) runs a board that
resets itself on a schedule.

## After it is up

- [Operations](../../guides/operations/operating.md) — health checks,
  configuration, mail, backups, and the operator CLI.
- [Upgrading](../../guides/operations/upgrading.md) — moving between
  released versions safely; the board, its plugins and the compose file
  carry one version number and move together.
- [Monitoring](../../guides/operations/monitoring.md) — what to alert on
  once people rely on it.
