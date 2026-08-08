# Development

Running the board on your own machine — to read the code, write a theme, or send
a patch. Not to run a board anybody else can reach: that is the
[Quickstart](./quickstart.md), and `localhost:3000` is not something people can
post on.

**You need:** Node 22 or newer, pnpm 10, and Docker if you want a real database.

## Getting it running

```sh
git clone https://github.com/meith-dev/meith.git
cd meith
pnpm install
pnpm dev
```

That is already a working board on <http://localhost:3000>, with **no database
at all** — see [fixture mode](#fixture-mode-and-why-it-exists) below. Enough to
click through every reading surface, try a theme, and see what the software is.

For anything that writes — posting, moderation, the installer — you need
Postgres:

```sh
docker compose -f docker-compose.dev.yml up -d    # Postgres on port 55432
cp .env.example .env
```

Then set two lines in `.env`:

```sh
DATA_SOURCE=postgres
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/community_test
```

```sh
pnpm community migrate
pnpm dev
```

Open <http://localhost:3000/install> and run the installer, which is the same
one a real deployment runs. It seals itself when it finishes; on a scratch
database that is fine, and `docker compose -f docker-compose.dev.yml down -v`
gives you a clean one.

The dev compose file uses a **named volume**, so the board survives the
container being recreated. It is the `-v` that throws it away.

### Fixture mode, and why it exists

With no `DATABASE_URL`, `DATA_SOURCE` falls back to `fixture`: deterministic
in-memory repositories with a sample board in them. It is not a mock layer bolted
on for tests — it is a driver behind the same interfaces as Postgres, and three
things depend on it.

- **A fresh checkout runs.** `pnpm install && pnpm dev` needs nothing else, which
  is the difference between somebody trying this project and closing the tab.
- **The production build needs no database.** `next build` prerenders, and a
  build that opened a connection would fail wherever the build runs before the
  database is reachable. CI builds in fixture mode; so does the Docker image.
- **The test suite is fast**, because most of it never touches a socket.

What it deliberately does *not* do is fake a write. Fixture mode has no
installer, no presence store and no statistics store, and each says so rather
than returning a convincing zero.

## The workspace

A pnpm workspace. Applications in `apps/`, everything else in `packages/`,
`themes/` and `plugins/`.

| Directory | Package | What it is |
|---|---|---|
| `apps/community` | `@meith/web` | The board itself. `pnpm dev`, on port 3000. |
| `apps/web` | `@meith/site` | meith.dev — the landing page and these documents. `pnpm site:dev`, on port 3100. |
| `apps/worker` | `@meith/worker` | The tick, as a long-running process. |
| `apps/cli` | `@meith/cli` | The operator CLI. `pnpm community …`. |
| `packages/*` | `@meith/*` | The domain: accounts, communities, posts, authorization, search, drivers, and the rest. |
| `themes/*`, `plugins/*` | | The default theme, a second worked theme, and the reference plugin. |
| `examples/*` | | Reference code to copy, not installed: the worked example plugin and theme. See [`examples/README.md`](https://github.com/meith-dev/meith/tree/main/examples). |

Every `@meith/*` import resolves through tsconfig path aliases straight to
`src/index.ts`. There is no build step between packages, which is why a
typecheck is fast and why `pnpm workspace:check` exists — see
[the invariant scripts](#the-scripts-that-fail-on-purpose).

How those packages relate — the layers, what may import what, and why — is
[Architecture](./architecture.md).

## The commands

| | |
|---|---|
| `pnpm dev` | The board, on 3000. |
| `pnpm site:dev` | meith.dev, on 3100. |
| `pnpm community <command>` | The operator CLI against your `.env`. `--help` lists it. |
| `pnpm test` | The whole suite. `pnpm test:watch` while you work. |
| `pnpm typecheck` | The workspace. `:app` and `:site` are the two Next projects. |
| `pnpm lint` | ESLint. |
| `pnpm verify` | **Everything CI's `static` job runs.** Run it before opening a pull request; CI's other jobs build the image and drive a browser. |
| `pnpm test:e2e` | Playwright: the no-JS paths and the accessibility checks. |

`pnpm verify` is the one that matters: invariant guards, the generated-document
checks, lint, dependency rules, all three typecheck projects and the full test
suite. If it passes locally, CI's `static` job will too.

> [!IMPORTANT]
> **Do not run `pnpm format`.** It reformats the entire tree — over a thousand
> files — and buries whatever you were actually changing. Format the files you
> touched, or let your editor do it on save.

## The database in tests

`pnpm test` needs no database at all. Repository tests, migrations, anything
asserting on real SQL — all of it runs against PGlite, a real Postgres compiled
to WebAssembly, booted in-process per suite with the checked-in migration SQL
applied.

One suite is the exception: `packages/db/src/client.pg.test.ts` needs a real
Postgres *server*, because PGlite bypasses the client driver and has accepted a
write every real server rejected. It skips unless `TEST_DATABASE_URL` is set:

```sh
docker compose -f docker-compose.dev.yml up -d
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/community_test pnpm test
```

CI's `migrations` job sets it, so "it passed locally" covers everything except
that one seam — and CI covers the seam.

## The scripts that fail on purpose

Several gates in `pnpm verify` exist because something once passed every other
check and broke on a clean install. Each is a fact about the repository that
nothing else reads:

| Script | What it catches |
|---|---|
| `workspace:check` | A package directory with sources and no `package.json`, or a manifest the lockfile has not seen. Both pass every other gate and fail `pnpm install --frozen-lockfile`, which is CI's first step. |
| `guards` | Textual invariants — the things a grep can prove and a type cannot. |
| `slots:check` | The server/client boundary in theme slots. |
| `hooks:wired` | A hook fired by name that the registry does not declare — the typo that would otherwise be a call nothing listens to. It also derives the wired/unwired list that `pnpm plugin:docs` publishes. |
| `theme:docs:check`, `plugin:docs:check`, `api:docs:check`, `perf:docs:check` | A generated reference that has drifted from the code it describes. |
| `docs:index:check`, `site:docs:check` | A document in `docs/` that no index links to, or that is neither published nor explicitly repository-only. |

## The generated documents

Four documents here are written from the code they describe and must not be
edited by hand:

```sh
pnpm theme:docs      # docs/theme-slots.md,  from the theme registry
pnpm plugin:docs     # docs/plugin-hooks.md, from the hook registry
pnpm api:docs        # docs/rest-api.md,     from the route registry
pnpm perf:docs       # docs/performance.md,  from the last load run
```

`pnpm verify` fails when one is stale, deliberately: a reference read by somebody
who cannot see the source is worse than no reference when it is wrong.

## The documentation itself

`docs/*.md` is the one editable copy. The site at
[meith.dev/docs](https://meith.dev/docs) renders those same files at build time
and holds no copy of any of them, so a correction is one edit in one place.

Adding a document means putting it in `docs/`, naming it in
`apps/web/content/docs.manifest.json` — under `documents` to publish it, or
`internal` to keep it in the repository — and running:

```sh
pnpm site:docs      # rewrites the documentation table in README.md and checks the set
```

Both index checks fail on a file that is in neither list, so a new document
cannot quietly go unlinked.

## Before opening a pull request

1. `pnpm verify` passes.
2. New behaviour has a test that fails without it.
3. A departure from the plan text is recorded in
   [`deviations.md`](./deviations.md), numbered, with the reasoning.
4. [Next.js conventions](./nextjs-conventions.md) — the decisions that would
   otherwise be re-litigated in every review.

## Where to read next

| You want to | Read |
|---|---|
| How the system fits together | [Architecture](./architecture.md) |
| The conventions this codebase holds to | [Next.js conventions](./nextjs-conventions.md) |
| To write a theme | [The theme API](./theme-api.md) |
| To write a plugin | [The plugin API](./plugin-api.md) |
| To know why something is the way it is | [`deviations.md`](./deviations.md) |
| To know what is still to be built | [`roadmap.md`](./roadmap.md), [`plan-status.md`](./plan-status.md) |
