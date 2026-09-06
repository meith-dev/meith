# Meith documentation

This directory is the source for [meith.dev/docs](https://www.meith.dev/docs). The site renders these files as they are. Pick the section for what you are doing; nothing here needs reading in order.

| If you want to… | Read… |
|---|---|
| See what Meith is | [Introduction](./setting-up/introduction.md) |
| Run a board on your machine | [Quickstart](./setting-up/quickstart.md) |
| Put a board on a server | [Deployment](./setting-up/deployment/index.md) |
| Set up a board that has just been installed | [First steps](./getting-started/first-steps.md) |
| Move a MyBB or phpBB community across | [Migrating](./getting-started/migrating.md) |
| Mind the server a board runs on | [Operations](./operating/operating.md) |
| Run the community from the browser | [The organiser's guide](./using/organiser-guide.md) |
| Add a plugin or theme to a board | [Installing plugins and themes](./getting-started/installing.md) |
| Build a theme or plugin | [Write your first plugin](./developing/first-plugin.md) |
| Contribute to Meith | [Development](./developing/development.md) |

## Setting up

What Meith is, and a board running: on your machine in a minute, then on a server of your own.

- [Introduction](./setting-up/introduction.md) — what Meith is and the three ideas it is built on.
- [Quickstart](./setting-up/quickstart.md) — a board on your machine, no database required.
- [Deployment](./setting-up/deployment/index.md) — the four-service production shape and which route to take.
  - [Coolify](./setting-up/deployment/coolify.md) — the guided route, from a browser.
  - [Docker Compose by hand](./setting-up/deployment/docker-compose.md) — a `.env` you write and a proxy you run.
  - [Vercel](./setting-up/deployment/vercel.md) — the board on functions, and how to leave again.

## Getting started

The first hour with a running board, and what a board is made of.

- [First steps](./getting-started/first-steps.md) — name it, create the forums, decide who may join, appoint the staff, switch the backups on.
- [Configuration in code](./getting-started/configuration.md) — what the board repository pins, and what stays in the admin panel.
- [Installing plugins and themes](./getting-started/installing.md) — install the package, register it, redeploy, manage it from the panel.
- [Migrating from MyBB or phpBB](./getting-started/migrating.md) — the import command, what comes across, and the cut-over.
  - [MyBB parity decisions](./getting-started/mybb-parity.md) and [phpBB parity decisions](./getting-started/phpbb-parity.md) — where a migrated board deliberately behaves differently.

## Operating

For the person minding the server. Assumes an evening a month, not a pager.

- [Operations](./operating/operating.md) — services, health checks, configuration, the CLI, mail, web push, cookies and headers, troubleshooting.
- [Backups](./operating/backups.md) — take one, schedule them, ship them off-site, restore one.
- [Upgrading](./operating/upgrading.md) — move between released versions, and what each release changed.
- [Monitoring & alerting](./operating/monitoring.md) — liveness, readiness, metrics, tracing, logs.
- [Disaster recovery](./operating/disaster-recovery.md) — rebuild a board when the server is gone.
- [Signing in](./operating/single-sign-on.md) — two-factor, federated sign-in, passkeys, sessions.
- [Languages](./operating/internationalisation.md) — locale selection and translation packages.
- [Webhooks](./operating/webhooks.md) — deliver board events to an endpoint and verify the signatures.
- [Scaling out](./operating/scaling.md) — more than one web instance and a shared cache.
- [Demo mode](./operating/demo-mode.md) — a public board that resets itself.

## Using

For organisers, moderators and members. Browser only, no shell access.

- [The organiser's guide](./using/organiser-guide.md) — settings, forums, appearance, announcements, members, handover.
- [The moderator's guide](./using/moderation-guide.md) — approval, reports, tidying threads, warnings, bans.
- [Forums and permissions](./using/forums.md) — the forum tree and the per-forum permission matrix.
- [Groups and promotions](./using/groups.md) — what a group carries board-wide, and automatic promotion.
- [Spam controls and filters](./using/antispam.md) — the registration challenge, the limits, the word filter, the ban filters.
- [Reputation](./using/reputation.md) — members rating each other.
- [Search](./using/search.md) — the language, switching it off, and the limits.
- [The memberships guide](./using/membership-guide.md) — plans, discounts, gifts, the desk and the ledger.
- [Writing a post](./using/formatting.md) — the composer and its Markdown.

## Developing

Extending a board, the generated references, and working on Meith itself.

- [Write your first plugin](./developing/first-plugin.md) — from an empty directory to a plugin running in a board.
- [Themes](./developing/themes.md) — slots, view models, tokens, packaging.
- [Plugins](./developing/plugins.md) — hooks, lifecycle, routes, pages, and crash isolation.
- [The marketplace](./developing/marketplace.md) — the curated feed and listing by pull request.
- [REST API v1](./reference/api.md) — generated; `reference/openapi.json` is the machine-readable form.
- [Theme slot reference](./reference/theme-slots.md) — generated.
- [Plugin hook reference](./reference/plugin-hooks.md) — generated.
- [Architecture](./developing/architecture.md) — processes, package boundaries, request flow.
- [Performance](./reference/performance.md) — generated budgets and recorded results.
- [Development](./developing/development.md) — local setup, the workspace, tests, and the checks before a pull request.
- [Next.js conventions](./developing/nextjs-conventions.md) and [Releasing](./developing/release.md) — kept in the repository; not published on the site.

## Generated references

`docs/reference/` holds only generated files. Edit the source, then regenerate.

| File | Command |
|---|---|
| `reference/theme-slots.md` | `pnpm theme:docs` |
| `reference/plugin-hooks.md` | `pnpm plugin:docs` |
| `reference/api.md`, `reference/openapi.json` | `pnpm api:docs` |
| `reference/performance.md` | `pnpm perf:docs` |

`pnpm verify` checks that generated references and both documentation indexes are current. When adding a document, add it to `apps/web/content/docs.manifest.json`, link it here, and run `pnpm site:docs`.
