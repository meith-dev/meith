# Documentation

Each document has one audience and one job, and the tables below say which. A
docs directory whose entry point is a directory listing makes every reader guess,
and most of them guess the roadmap.

**New here?** Start with the [Quickstart](./quickstart.md) — a board on your own
server, on a domain, in about twenty minutes.

## Find your document

| You are | Read |
|---|---|
| Setting up a board for the first time | [Quickstart](./quickstart.md) |
| Running one | [Running a board](./operating.md) |
| Upgrading one | [Upgrading a board](./upgrading.md) |
| Adding 2FA, SSO or passkeys | [Signing in](./single-sign-on.md) |
| Deploying without a panel | [Deploying by hand](./self-hosting.md) |
| Running a public demo of it | [Demo mode](./demo-mode.md) |
| Writing a theme | [The theme API](./theme-api.md) |
| Writing a plugin | [The plugin API](./plugin-api.md) |
| Calling the API | [REST API v1](./rest-api.md) |
| Moving a forum off MyBB | [MyBB parity](./mybb-parity.md) |
| Working on Meith itself | [Development](./development.md) |
| Understanding how it fits together | [Architecture](./architecture.md) |
| Cutting a release | [Releasing](./release.md) |

## Running a board

The path from nothing to a board people are posting on, and everything after.

| Document | What it answers |
|---|---|
| [`quickstart.md`](./quickstart.md) | **Start here.** Nothing to a board people can reach, on your own server with Coolify. |
| [`operating.md`](./operating.md) | **The operator handbook.** Configuration, the operator CLI, permissions, themes, plugins, spam, migrations, backup and restore, connection pooling, and the failures that actually happen. |
| [`upgrading.md`](./upgrading.md) | Taking a board from one version to the next, how far you can jump, and what to do when a migration fails halfway. |
| [`single-sign-on.md`](./single-sign-on.md) | Everything beyond a password: two-factor authentication, federated sign-in, passkeys, the sessions a member holds, and the record of what has opened their account. |
| [`performance.md`](./performance.md) | The p95 budgets for hot pages, and what the last recorded run measured on a full-scale board. *Generated — do not edit.* |
| [`demo-mode.md`](./demo-mode.md) | A public board with its password printed on it, seeded with content, that deletes everything and rebuilds itself on a timer. What runs at demo.meith.dev, and what it changes. |

## Advanced deployment

| Document | What it answers |
|---|---|
| [`self-hosting.md`](./self-hosting.md) | The same board without the panel: Docker Compose, a `.env` you write, a reverse proxy you run, and what you take on for it. Most boards should take the Quickstart instead. |

## Themes

| Document | What it answers |
|---|---|
| [`theme-api.md`](./theme-api.md) | The slot contract: what the freeze covers, what a theme may do, how to write one. Policy, hand-written. |
| [`theme-slots.md`](./theme-slots.md) | Every slot and every view model. *Generated — do not edit.* |

## Plugins

| Document | What it answers |
|---|---|
| [`plugin-api.md`](./plugin-api.md) | What a plugin is, what it may and may not do, how failures are contained. Policy, hand-written. |
| [`plugin-hooks.md`](./plugin-hooks.md) | Every hook and payload. *Generated — do not edit.* |

## The API

| Document | What it answers |
|---|---|
| [`rest-api.md`](./rest-api.md) | Every endpoint, scope and rate limit. *Generated — do not edit.* |

## Migrating from MyBB

| Document | What it answers |
|---|---|
| [`mybb-parity.md`](./mybb-parity.md) | Every place this board behaves differently from MyBB, with the reason. Read it before promising anyone a like-for-like move. |

The importer itself, the legacy-URL redirects and the legacy password upgrade are
described in [`operating.md`](./operating.md).

## Development

Working on Meith itself.

| Document | What it answers |
|---|---|
| [`development.md`](./development.md) | **Start here.** Running it on your machine, the workspace, the commands, the gates, and what to do before opening a pull request. |
| [`architecture.md`](./architecture.md) | How it fits together: the processes, the layers, the path a request takes, and the seams — data, themes, plugins — everything else hangs off. |
| [`nextjs-conventions.md`](./nextjs-conventions.md) | The decisions that would otherwise be re-litigated in every pull request. |
| [`release.md`](./release.md) | How a version is cut: the lockstep version rule, what each release publishes, and the migration policy behind the version numbers. |

## About the generated references

Four documents here are written from the code they describe — the theme slots,
the plugin hooks, the REST routes, and the performance numbers. Regenerate them
with `pnpm theme:docs`, `pnpm plugin:docs`, `pnpm api:docs` and `pnpm perf:docs`.

`pnpm verify` fails when one is stale, deliberately: a reference read by somebody
who cannot see the source is worse than no reference when it is wrong.

## Keeping this index honest

`pnpm docs:index:check` fails when a file in `docs/` is not linked from here, and
`pnpm site:docs:check` fails when one is neither published on the website nor
explicitly listed as repository-only.

An index nobody maintains is worse than none: it tells a reader the list is
complete when it is not, and the document they needed is the one that got added
after the index was last touched.
