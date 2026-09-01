# Meith documentation

This directory is the source for [meith.dev/docs](https://www.meith.dev/docs). Choose a guide by task; you do not need to read the set in order.

## Start here

| If you want to… | Read… |
|---|---|
| See what Meith is | [Introduction](./getting-started/introduction.md) |
| Run a board on your machine | [Quickstart](./getting-started/quickstart.md) |
| Put a board on your own server | [Deployment](./getting-started/deployment/index.md) |
| Add a plugin or theme to a board | [Installing plugins and themes](./customization/installing.md) |
| Build a theme or plugin | [Write your first plugin](./customization/first-plugin.md) · [Themes](./customization/themes.md) · [Plugins](./customization/plugins.md) |
| Run an existing board from the browser | [Organiser guide](./guides/community/organiser-guide.md) |
| Contribute code | [Development](./contributing/development.md) |

## Getting started

- [Introduction](./getting-started/introduction.md) — the philosophy: server-first, code-first, self-hosted.
- [Quickstart](./getting-started/quickstart.md) — a board on your machine in about a minute, no database required.
- [Deployment](./getting-started/deployment/index.md) — the four-service production shape and the route chooser.
  - [Coolify](./getting-started/deployment/coolify.md) — the guided route: deploy on your own server from a browser.
  - [Docker Compose by hand](./getting-started/deployment/docker-compose.md) — a `.env` you write and a reverse proxy you operate.
  - [Vercel](./getting-started/deployment/vercel.md) — the board on functions, and how to leave again.

## Configuration & guides

- [Configuration in code](./guides/configuration.md) — the board repository: what is pinned in code, what stays in the admin panel.
- [Migrating from MyBB or phpBB](./guides/migrating.md) — the importer moves members, content, private messages, attachments, subscriptions, polls, reputation, warnings and bans, with working passwords and redirects from the old URLs.

Running your community — browser only, no shell access:

- [Organiser guide](./guides/community/organiser-guide.md) — board settings, forums, groups, members, and handover.
- [Moderator guide](./guides/community/moderation-guide.md) — approval, reports, thread maintenance, warnings, and bans.
- [Memberships guide](./guides/community/membership-guide.md) — Stripe plans, discounts, gifts, the membership desk, and the ledger.
- [Writing a post](./guides/community/formatting.md) — the composer's toolbar and its Markdown.
- [Forums and permissions](./guides/community/forums.md) — the forum tree and the per-forum permission matrix.
- [Groups and promotions](./guides/community/groups.md) — what a group carries board-wide.
- [Spam controls and filters](./guides/community/antispam.md) — the registration challenge, every threshold, the render-time word filter, and the ban filters that turn somebody away before an account exists.
- [Reputation](./guides/community/reputation.md) — members rating each other, and the two settings that decide what a post offers.
- [Search](./guides/community/search.md) — switching it off without losing the index, and the two limits on how often.

Operating the server:

- [Operations](./guides/operations/operating.md) — health checks, configuration, CLI commands, mail, backups, web push, the cookies and security headers the board serves, and troubleshooting.
- [Monitoring & alerting](./guides/operations/monitoring.md) — liveness versus readiness, metrics, tracing, and logs.
- [Webhooks](./guides/operations/webhooks.md) — deliver board events to an endpoint you choose, and verify the signatures.
- [Upgrading](./guides/operations/upgrading.md) — move between released versions safely.
- [Disaster recovery](./guides/operations/disaster-recovery.md) — restore a board when the original server is unavailable.
- [Signing in](./guides/operations/single-sign-on.md) — passwords, two-factor authentication, federated sign-in, passkeys, and sessions.
- [Languages](./guides/operations/internationalisation.md) — locale selection and translation packages.
- [Scaling out](./guides/operations/scaling.md) — add web instances and a shared cache.
- [Demo mode](./guides/operations/demo-mode.md) — run a public board that resets itself.

## Customization

- [Installing plugins and themes](./customization/installing.md) — the board admin's guide: find one, install the package, register it, redeploy, and manage it from the panel.
- [Write your first plugin](./customization/first-plugin.md) — the walkthrough from an empty directory to a plugin running inside a board and listed on the marketplace.
- [Themes](./customization/themes.md) — theme slots, view models, and packaging.
- [Plugins](./customization/plugins.md) — plugin boundaries, typed hooks, lifecycle, and crash isolation.
- [The marketplace](./customization/marketplace.md) — the curated feed of plugins and themes, and the listing-by-PR process.

## Reference

- [REST API v1](./reference/api.md) — generated routes, scopes, request bodies, and responses.
- `reference/openapi.json` — machine-readable OpenAPI document generated alongside the REST reference.
- [Theme slot reference](./reference/theme-slots.md) — generated slot and view-model reference.
- [Plugin hook reference](./reference/plugin-hooks.md) — generated hook and payload reference.
- [Architecture](./reference/architecture.md) — processes, package boundaries, and request flow.
- [Performance](./reference/performance.md) — generated performance budgets and recorded results.
- [MyBB parity decisions](./reference/mybb-parity.md) and [phpBB parity decisions](./reference/phpbb-parity.md) — intentional product differences from the board you are leaving; appendices to [Migrating](./guides/migrating.md).

## Contributing

- [Development](./contributing/development.md) — local setup, tests, and pull-request checks.
- [Next.js conventions](./contributing/nextjs-conventions.md) — application-layer patterns enforced in this repository.
- [Releasing](./contributing/release.md) — versioning and release outputs.

## Generated references

Do not edit generated files directly.

| File | Command |
|---|---|
| `reference/theme-slots.md` | `pnpm theme:docs` |
| `reference/plugin-hooks.md` | `pnpm plugin:docs` |
| `reference/api.md`, `reference/openapi.json` | `pnpm api:docs` |
| `reference/performance.md` | `pnpm perf:docs` |

`pnpm verify` checks that generated references and both documentation indexes are current. When adding a document, add it to `apps/web/content/docs.manifest.json`, link it here, and run `pnpm site:docs`.
