# Meith documentation

This directory is the source for [meith.dev/docs](https://www.meith.dev/docs). Choose a guide by task; you do not need to read the set in order.

## Start here

| If you want to… | Read… |
|---|---|
| Install a new board | [Quickstart](./quickstart.md) |
| Run an existing board from the browser | [Organiser guide](./organiser-guide.md) |
| Moderate posts and members | [Moderator guide](./moderation-guide.md) |
| Manage paid memberships | [Memberships guide](./membership-guide.md) |
| Maintain the server | [Operations](./operating.md) |
| Contribute code | [Development](./development.md) |

## Install and evaluate

- [Quickstart](./quickstart.md) — deploy with Coolify on your own server.
- [Deploying by hand](./self-hosting.md) — use Docker Compose with a reverse proxy you operate.
- [Running on Vercel](./vercel.md) — deploy onto functions instead of a server: the driver set, the cron tick, build-time migrations, and how to leave.
- [Demo mode](./demo-mode.md) — run a public board that resets itself.

## Administer a community

These guides use the browser interface; they do not require shell access.

- [Organiser guide](./organiser-guide.md) — board settings, forums, groups, members, and handover.
- [Moderator guide](./moderation-guide.md) — approval, reports, thread maintenance, warnings, and bans.
- [Memberships guide](./membership-guide.md) — Stripe plans, discounts, gifts, the membership desk, and the ledger.
- [Writing a post](./formatting.md) — the composer's toolbar and its Markdown: highlighted code, spoilers, mentions, link previews, and inline attachments.

## Operate a board

- [Operations](./operating.md) — health checks, configuration, CLI commands, mail, backups, and troubleshooting.
- [Monitoring & alerting](./monitoring.md) — liveness versus readiness, the optional metrics endpoint, tracing, and shipping logs.
- [Upgrading](./upgrading.md) — move between released versions safely.
- [Disaster recovery](./disaster-recovery.md) — restore a board when the original server is unavailable.
- [Signing in](./single-sign-on.md) — passwords, two-factor authentication, federated sign-in, passkeys, and sessions.
- [Languages](./internationalisation.md) — locale selection and translation packages.
- [Web push](./web-push.md) — browser notifications and installable-board metadata.
- [Scaling out](./scaling.md) — add web instances and a shared cache.
- [Performance](./performance.md) — generated performance budgets and recorded results.

## Extend Meith

- [Theme API](./theme-api.md) — create and package a theme.
- [Theme slot reference](./theme-slots.md) — generated slot and view-model reference.
- [Plugin API](./plugin-api.md) — plugin boundaries, lifecycle, and packaging.
- [Plugin hook reference](./plugin-hooks.md) — generated hook and payload reference.
- [The marketplace](./marketplace.md) — the curated feed of plugins and themes, the listing-by-PR process, and the review bar.
- [REST API v1](./rest-api.md) — generated routes, scopes, request bodies, and responses.
- `openapi.json` — machine-readable OpenAPI document generated alongside the REST reference.

## Migrate from MyBB or phpBB

The importer moves members, content, private messages, attachments, avatars, subscriptions, polls, reputation, warnings, bans and buddy lists from MyBB or phpBB, with working passwords and redirects from the old URLs. [Migrating from MyBB or phpBB](./migrating.md) is the full procedure, with the per-source coverage table and what to do after it finishes. Also read [MyBB parity decisions](./mybb-parity.md) or [phpBB parity decisions](./phpbb-parity.md) — each lists intentional product differences from the board you are leaving.

## Contribute

- [Development](./development.md) — local setup, tests, and pull-request checks.
- [Architecture](./architecture.md) — processes, package boundaries, and request flow.
- [Next.js conventions](./nextjs-conventions.md) — application-layer patterns enforced in this repository.
- [Releasing](./release.md) — versioning and release outputs.

## Generated references

Do not edit generated files directly.

| File | Command |
|---|---|
| `theme-slots.md` | `pnpm theme:docs` |
| `plugin-hooks.md` | `pnpm plugin:docs` |
| `rest-api.md`, `openapi.json` | `pnpm api:docs` |
| `performance.md` | `pnpm perf:docs` |

`pnpm verify` checks that generated references and both documentation indexes are current. When adding a document, add it to `apps/web/content/docs.manifest.json`, link it here, and run `pnpm site:docs`.
