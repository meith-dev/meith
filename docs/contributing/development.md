# Development setup

Requires Node.js 22+ and pnpm 10. Run commands from the Meith repository root unless stated otherwise.

## Start with fixtures

```sh
git clone https://github.com/meith-dev/meith.git
cd meith
pnpm install
pnpm dev
```

Open `http://localhost:3000`. Fixtures require no database and do not save changes.

## Use PostgreSQL

```sh
docker compose -f docker/compose.dev.yml up -d
cp .env.example .env
```

Set these values in `.env`, including a random `AUTH_SECRET` of at least 32 characters:

```dotenv
DATA_SOURCE=postgres
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/community_test
AUTH_SECRET=replace-with-a-random-secret-at-least-32-characters
```

Run `pnpm meith migrate`, then `pnpm dev`. Open `/install`, unlock with `AUTH_SECRET` and create the board administrator. Use [Scheduled tasks](../operations/scheduled-tasks.md) for background work.

Stop this database before running the self-contained browser suite if it uses the same port. `docker compose -f docker/compose.dev.yml down -v` deletes its data.

## Work on the website

```sh
pnpm site:dev
```

Open `http://localhost:3100`. The site's forum links point to the configured live forum. Docs are loaded directly from `docs/`; see [Documentation](documentation.md).

## Repository layout

| Path | Purpose |
|---|---|
| `apps/community` | Board application (`@meith/web`) |
| `apps/web` | meith.dev (`@meith/site`) |
| `apps/cli`, `apps/worker` | Operator commands and background worker |
| `packages` | Domain, runtime, infrastructure and extension contracts |
| `boards/stock` | Official image's board configuration |
| `themes`, `plugins`, `examples` | Extensions and example source |
| `docker` | Deployment files |

See [Architecture](architecture.md) and [Board workspaces](board-workspaces.md).

## Validate changes

Run focused tests while editing, then `pnpm verify` and `pnpm comments:check`. Use [Testing](testing.md) for browser and PostgreSQL tests. Format only touched files with `pnpm exec biome check --write <files>`.

No explanatory inline comments are allowed. Put explanations in `docs/`. Exceptions are `biome-ignore`, `@ts-expect-error`, compiler-read type annotations, and the six source files used for generated theme/plugin references. See [Repository checks](repository-checks.md).

Use Conventional Commits (`type(scope): summary`). Update docs with behaviour changes. Feature changes do not change versions.
