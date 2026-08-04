# Meith

**Forum software for communities that want to build something together.**
[meith.dev](https://meith.dev)

The internet used to feel like a neighborhood, but today, it often feels like a
fragmented crowd. We wanted to build a platform that brought the neighborhood
back.

We named our software Meith after the ancient Irish concept of **meitheal**: a
group of people coming together to help one another with a shared task. In a
true meitheal, expertise is shared freely, heavy lifting is distributed, and the
community grows stronger through cooperation. Meith provides the digital
infrastructure for modern communities to do exactly that. Whether your users are
trying to fill a regional networking gap, build open-source software, or share a
niche hobby, Meith gives them the space to gather and grow.

## Getting started

```sh
npx create-meith my-board
cd my-board
npm install
cp .env.example .env.local    # fill in DATABASE_URL and AUTH_SECRET
npm run dev
```

Then open `/install`. Five steps, and the page names each one before it runs it.
The preflight check runs first and reports what it finds — read it, because
nearly every way a new board fails is visible there.

Deploy it serverlessly on Vercel, or self-host the standalone Docker image with
its worker. Both are first-class; see
[`docs/operating.md`](./docs/operating.md).

## What you get

- **A real permission model.** Around 45 permission fields resolved per actor
  per forum, not a three-tier guess. Search, feeds and the API all answer to it,
  so there is no path that reads around the rules.
- **Themes that cannot break the board.** A frozen v1 slot contract, documented
  and generated from the registry, so a theme is replaceable rather than a fork.
- **Plugins with contained failures.** Hooks with typed payloads; a plugin that
  throws does not take a page down with it.
- **Postgres full-text search**, weighted so a thread's subject beats a passing
  mention, and paged on a keyset so results never repeat or skip.
- **A migration path from MyBB** — resumable, so a large board can be imported
  across several sessions.
- **An operator CLI** for everything you should not need a browser for:
  migrations, users, settings, scheduled tasks, search reindexing.

## Documentation

[`docs/`](./docs/README.md) is organised by what you are trying to do:

| …you are | Read |
|---|---|
| running a board | [`operating.md`](./docs/operating.md) — the operator handbook |
| upgrading one | [`upgrading.md`](./docs/upgrading.md) |
| writing a theme | [`theme-api.md`](./docs/theme-api.md) |
| writing a plugin | [`plugin-api.md`](./docs/plugin-api.md) |
| calling the API | [`rest-api.md`](./docs/rest-api.md) |
| migrating from MyBB | [`mybb-parity.md`](./docs/mybb-parity.md) |
| working on Meith itself | [`docs/README.md`](./docs/README.md) |

## Working on Meith

A pnpm workspace. Node 22+, pnpm 10, and a Postgres to point it at:

```sh
pnpm install
docker compose -f docker-compose.dev.yml up -d
pnpm forum migrate
pnpm dev
```

`pnpm verify` runs what CI runs: the invariant guards, the generated-doc checks,
lint, dependency rules, both typecheck projects and the full test suite. Run it
before opening a pull request.

## Licence

Meith is open source. **A licence file has not been added yet** — until one is,
the default is all rights reserved, which is not what an open-source release
means. Pick one and add it before announcing.
