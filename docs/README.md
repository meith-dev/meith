# Documentation

This folder is the documentation for Meith. The same files are published at
[meith.dev/docs](https://www.meith.dev/docs) — the site renders them at build
time, so there is only one copy to edit.

**New here?** Start with the [Quickstart](./quickstart.md): it takes you from a
bare server to a board on your own domain in about twenty minutes.

## Find your document

| You want to | Read |
|---|---|
| Set up a board for the first time | [Quickstart](./quickstart.md) |
| Run a board day to day | [Running a board](./operating.md) |
| Move a board to a new version | [Upgrading a board](./upgrading.md) |
| Add 2FA, SSO or passkeys | [Signing in](./single-sign-on.md) |
| Deploy with Docker Compose, no panel | [Deploying by hand](./self-hosting.md) |
| Run a public demo board | [Demo mode](./demo-mode.md) |
| Write a theme | [The theme API](./theme-api.md) |
| Write a plugin | [The plugin API](./plugin-api.md) |
| Call the REST API | [REST API v1](./rest-api.md) |
| Move a forum off MyBB | [MyBB parity decisions](./mybb-parity.md) |
| Work on Meith itself | [Development](./development.md) |
| Understand how it fits together | [Architecture](./architecture.md) |
| Cut a release | [Releasing](./release.md) |

## Running a board

| Document | What it covers |
|---|---|
| [`quickstart.md`](./quickstart.md) | **Start here.** From nothing to a live board on your own server, using Coolify. |
| [`operating.md`](./operating.md) | The operator handbook: configuration, the CLI, permissions, themes, plugins, mail, spam controls, backups, and troubleshooting. |
| [`upgrading.md`](./upgrading.md) | Moving between versions: the upgrade command, how far you can jump, and the behaviour changes each upgrade brings. |
| [`single-sign-on.md`](./single-sign-on.md) | Everything beyond a password: two-factor authentication, federated sign-in, passkeys, sessions, and the sign-in activity log. |
| [`performance.md`](./performance.md) | The p95 budgets for hot pages and what the last load run measured. *Generated — do not edit.* |
| [`demo-mode.md`](./demo-mode.md) | The self-resetting public demo board that runs at demo.meith.dev, and how to run one yourself. |

## Advanced deployment

| Document | What it covers |
|---|---|
| [`self-hosting.md`](./self-hosting.md) | The same board without Coolify: Docker Compose, a `.env` you write, and a reverse proxy you run. Most boards should use the Quickstart instead. |

## Themes

| Document | What it covers |
|---|---|
| [`theme-api.md`](./theme-api.md) | The theme contract: how to write a theme, what a theme may do, and what the API freeze covers. |
| [`theme-slots.md`](./theme-slots.md) | Every slot and every view model. *Generated — do not edit.* |

## Plugins

| Document | What it covers |
|---|---|
| [`plugin-api.md`](./plugin-api.md) | The plugin contract: what a plugin is, what it may and may not do, and how failures are contained. |
| [`plugin-hooks.md`](./plugin-hooks.md) | Every hook and payload. *Generated — do not edit.* |

## The API

| Document | What it covers |
|---|---|
| [`rest-api.md`](./rest-api.md) | Every endpoint, scope and rate limit. *Generated — do not edit.* |

## Migrating from MyBB

| Document | What it covers |
|---|---|
| [`mybb-parity.md`](./mybb-parity.md) | Every place Meith deliberately behaves differently from MyBB, with the reasoning and the cost. Read it before promising anyone a like-for-like move. |

The importer itself, the legacy-URL redirects and the legacy password upgrade
are covered in [Running a board](./operating.md).

## Development

| Document | What it covers |
|---|---|
| [`development.md`](./development.md) | **Start here.** Running Meith on your machine, the workspace layout, the commands, and what to do before opening a pull request. |
| [`architecture.md`](./architecture.md) | The system as a whole: processes, layers, the path a request takes, and the extension seams. |
| [`nextjs-conventions.md`](./nextjs-conventions.md) | The codebase's Next.js rules: server components, Server Actions, caching, forms, and the guards that enforce them. |
| [`release.md`](./release.md) | How a release is cut, what it publishes, and the version policy. |

## Generated references

Four documents are generated from the code they describe and must not be edited
by hand:

```sh
pnpm theme:docs      # docs/theme-slots.md   — from the slot registry
pnpm plugin:docs     # docs/plugin-hooks.md  — from the hook registry
pnpm api:docs        # docs/rest-api.md      — from the route registry
pnpm perf:docs       # docs/performance.md   — from the last load run
```

`pnpm verify` fails when any of them is stale, so a change to a registry and
the reference that describes it always land in the same commit.

## How this index stays complete

Two checks keep the documentation set honest:

- `pnpm docs:index:check` fails when a file in `docs/` is not linked from this
  index.
- `pnpm site:docs:check` fails when a file is neither published on the website
  nor explicitly listed as repository-only in
  `apps/web/content/docs.manifest.json`.

To add a document: put it in `docs/`, add it to the manifest (under `documents`
to publish it, or `internal` to keep it repository-only), link it here, and run
`pnpm site:docs`.
