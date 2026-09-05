# Introduction

Meith is open-source, self-hosted forum software for conversations worth
keeping — built for communities and owned by them. It is code-first,
built on modern TypeScript, and quick enough to run with JavaScript
disabled. It gives a community threaded discussions, search, permissions,
moderation, paid memberships, themes, plugins and an operator CLI — on a
server you control, with no per-member pricing, under the MIT licence.

This page is the philosophy. If you would rather see it than read about
it, [the quickstart](./quickstart.md) has a board running on your machine
in about a minute, and [demo.meith.dev](https://demo.meith.dev) is a real
one you can open now.

## Server-first

Every page a member reads is rendered on the server. The browser gets
HTML, not an application: threads, search, the composer and the admin
screens all work with JavaScript switched off, and script only layers
convenience — live previews, mention suggestions — on top of pages that
already work without it. That baseline is not a fallback mode; it is how
the board is built, and the e2e suite runs mostly with JavaScript off to
keep it true.

Being server-first is also why the board stays fast. There is no bundle
to hydrate before the first paint, and the performance budgets are
enforced the other way around: [the performance
reference](../reference/performance.md) is generated from measured runs
against a board with years of history in it, and a release that breaks a
budget is never published.

## Code-first

A board is a small repository, not a snowflake server. What the board
*is made of* is pinned in code and versioned:

- `package.json` pins the engine — `@meith/web`, the CLI and the default
  theme, at one exact version that moves only when you upgrade.
- `meith.config.ts` registers the themes the board ships and which
  one is the default, statically, so the compiler checks the lot.
- `board.plugins.json` names the installed plugins, and a generated
  registry makes them part of the build.

Everything the community *does* — forums, permissions, groups, members,
settings, and every thread — lives in PostgreSQL and is run from the
browser by the people who run the community. The line between the two is
deliberate: a deploy can never delete a forum, and an organiser can never
break the build. [Configuration in code](../guides/configuration.md)
walks the whole boundary.

The same contracts are what you extend. Themes fill
[documented, versioned slots](../customization/themes.md) with typed view
models; plugins attach to [typed hooks](../customization/plugins.md) and
are isolated so one that crashes fails alone; and
[a REST API](../reference/api.md) covers anything an administrator can do
by hand.

## Self-hosted by default

A production board is four containers — PostgreSQL, a one-shot migration
service, the web app and a worker — on a machine your community rents.
There is no company in the middle: the bill follows the server, never the
membership, and when the people running it change, the board is handed
over whole. [Deployment](./deployment/index.md) has three routes up,
from a guided panel to a compose file you operate yourself; there is also
[a serverless route on Vercel](./deployment/vercel.md) for boards that
would rather not have a server at all.

Self-hosted does not mean self-reliant. Upgrades are versioned and
documented, backups are CLI commands, and
[the operations guides](../guides/operations/operating.md) assume the
person minding the machine has an evening a month for it, not a pager.

## Where to go next

- [Quickstart](./quickstart.md) — a board on your machine in about a
  minute, no database required.
- [Deployment](./deployment/index.md) — the same board on your own
  domain.
- [Configuration in code](../guides/configuration.md) — what the board
  repository holds and why.
- [Themes](../customization/themes.md) and
  [plugins](../customization/plugins.md) — the extension contracts.
- [Migrating](../guides/migrating.md) — moving a MyBB or phpBB board
  across whole, working passwords included.
