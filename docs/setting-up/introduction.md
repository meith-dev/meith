# Introduction

Meith is open-source, self-hosted forum software: threaded discussions,
search, permissions, moderation, paid memberships, themes, plugins and
an operator CLI, on a server you control, under the MIT licence, with no
per-member pricing.

If you would rather see it than read about it, [the
quickstart](./quickstart.md) has a board running on your machine in about
a minute, and [demo.meith.dev](https://demo.meith.dev) is a real one you
can open now.

Three decisions shape everything else.

## Server-first

Every page is rendered on the server. Threads, search, the composer and
the admin screens all work with JavaScript switched off; script only
adds conveniences such as live previews and mention suggestions on top
of pages that already work. The browser test suite runs mostly with
JavaScript off to keep that true.

This is also why the board is fast: there is no bundle to load before
the first paint. [The performance reference](../reference/performance.md)
is generated from measured runs against a board with years of history,
and a release that breaks a budget is not published.

## Code-first

A board is a small repository. What the board *is made of* is pinned in
code and versioned:

- `package.json` pins the engine, the CLI, the default theme and Next.js
  at exact versions, which move only when you upgrade.
- `meith.config.ts` registers the themes the board ships and which one
  is the default.
- `board.plugins.json` lists the installed plugins.

Everything the community *does* lives in PostgreSQL and is run from the
browser: forums, permissions, groups, members, settings, threads. A
deploy can never delete a forum, and an organiser can never break the
build. [Configuration in code](../getting-started/configuration.md)
draws the line in detail.

The same contracts are what you extend. Themes fill
[documented, versioned slots](../developing/themes.md) with typed view
models; plugins attach to [typed hooks](../developing/plugins.md) and are
isolated so that one that crashes fails alone; and
[a REST API](../reference/api.md) covers what an administrator can do by
hand.

## Self-hosted by default

A production board is four containers on a machine your community
rents: PostgreSQL, a one-shot migration service, the web app and a
worker. The bill follows the server, not the membership, and when the
people running it change, the board is handed over whole.
[Deployment](./deployment/index.md) has a guided route, a compose file
you operate yourself, and [a serverless route on
Vercel](./deployment/vercel.md) for boards that would rather not have a
server at all.

Self-hosted does not mean self-reliant. Upgrades are versioned and
documented, backups are a screen in the admin panel, and
[the operating guides](../operating/operating.md) assume the person
minding the machine has an evening a month for it, not a pager.

## Where to go next

- [Quickstart](./quickstart.md) — a board on your machine.
- [Deployment](./deployment/index.md) — the same board on your own domain.
- [First steps](../getting-started/first-steps.md) — the first hour after
  the installer.
- [Migrating](../getting-started/migrating.md) — moving a MyBB or phpBB
  board across, working passwords included.
