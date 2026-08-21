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
- [Demo mode](./demo-mode.md) — run a public board that resets itself.

## Administer a community

These guides use the browser interface; they do not require shell access.

- [Organiser guide](./organiser-guide.md) — board settings, forums, groups, members, and handover.
- [Moderator guide](./moderation-guide.md) — approval, reports, thread maintenance, warnings, and bans.
- [Memberships guide](./membership-guide.md) — Stripe plans, discounts, gifts, the membership desk, and the ledger.
- [Writing a post](./formatting.md) — the composer's toolbar and its Markdown: highlighted code, spoilers, mentions, link previews, and inline attachments.

## Operate a board

- [Operations](./operating.md) — health checks, configuration, CLI commands, mail, backups, and troubleshooting.
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
- [REST API v1](./rest-api.md) — generated routes, scopes, request bodies, and responses.
- `openapi.json` — machine-readable OpenAPI document generated alongside the REST reference.

## Migrate from MyBB

Read [MyBB parity decisions](./mybb-parity.md) before planning a migration. It lists intentional product differences. The import procedure itself is in [Operations](./operating.md#import-a-mybb-board).

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
