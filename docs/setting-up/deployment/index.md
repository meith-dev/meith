# Deployment

A production Meith board is four services, whichever route puts them
there:

- **PostgreSQL** stores everything the community makes.
- **A one-shot migration service** updates the schema and finishes
  before anything else starts.
- **The web service** answers browsers and the API.
- **The worker** runs scheduled and queued work once a minute. A board
  scaffolded outside this repository runs a small loop that drives the
  same work over HTTP instead.

Every route starts from the same scaffold, `npx create-meith` or [the
template](https://github.com/meith-dev/template), and ends the same way:
open `/install` on the new board to name it and create its first
administrator. Building the image on the server is the default; a
low-spec machine can pull one built elsewhere, and each route says how.

## Pick your route

| Route | For | You need |
|---|---|---|
| [Coolify](./coolify.md) | Most boards. The guided route. | A rented server and a domain; no terminal after setup |
| [Docker Compose by hand](./docker-compose.md) | Operators who already run a proxy | Docker Compose, a `.env` you write, a reverse proxy you operate |
| [Vercel](./vercel.md) | Boards that would rather not have a server | A Vercel account and a hosted Postgres; the worker becomes a cron tick |

If you only want something the public can poke,
[demo mode](../../operating/demo-mode.md) runs a board that resets itself
on a schedule.

## After it is up

- [First steps](../../getting-started/first-steps.md) — the first hour in
  the admin panel.
- [Operations](../../operating/operating.md) — health checks,
  configuration, mail, backups and the operator CLI.
- [Upgrading](../../operating/upgrading.md) — moving between released
  versions; the board, its plugins and the compose file carry one version
  number and move together.
- [Monitoring](../../operating/monitoring.md) — what to alert on once
  people rely on it.
