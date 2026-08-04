# Documentation

Each document has one audience and one job, and the tables below say which. A
docs directory whose entry point is a directory listing makes every reader guess,
and most of them guess the roadmap.

**New here?** Start with the [Quickstart](./quickstart.md).

## Find your document

| You are | Read |
|---|---|
| Setting up a board for the first time | [Quickstart](./quickstart.md) |
| Running one | [Running a board](./operating.md) |
| Upgrading one | [Upgrading a board](./upgrading.md) |
| Writing a theme | [The theme API](./theme-api.md) |
| Writing a plugin | [The plugin API](./plugin-api.md) |
| Calling the API | [REST API v1](./rest-api.md) |
| Moving a community off MyBB | [MyBB parity](./mybb-parity.md) |
| Working on Meith itself | [Building the project](#building-the-project) |

## Running a board

| Document | What it answers |
|---|---|
| [`quickstart.md`](./quickstart.md) | Empty directory to working board, in five steps. |
| [`operating.md`](./operating.md) | **The operator handbook.** Configuration, permissions, themes, plugins, spam, migrations, backup and restore, connection pooling, and the failures that actually happen. |
| [`upgrading.md`](./upgrading.md) | Taking a board from one version to the next, how far you can jump, and what to do when a migration fails halfway. |
| [`performance.md`](./performance.md) | The p95 budgets for hot pages, and what the last recorded run measured on a full-scale board. *Generated — do not edit.* |

## Themes

| Document | What it answers |
|---|---|
| [`theme-api.md`](./theme-api.md) | The v1 contract: what the freeze covers, what a theme may do, how to write one. Policy, hand-written. |
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
described in [`operating.md`](./operating.md) and in the roadmap's R4.

## Building the project

| Document | What it answers |
|---|---|
| [`nextjs-conventions.md`](./nextjs-conventions.md) | The decisions that would otherwise be re-litigated in every pull request. |
| [`roadmap.md`](./roadmap.md) | The canonical delivery plan, F01–F89, with acceptance criteria. The source of truth for *what* is being built. |
| [`plan-status.md`](./plan-status.md) | One row per plan feature: done, partial, or not started. The source of truth for *where* it is. |
| [`progress.md`](./progress.md) | The running log and the next action. Read this to pick up work. |
| [`deviations.md`](./deviations.md) | Every departure from the plan text, numbered, with the reasoning. Read before "fixing" something that looks wrong. |

### Architecture decision records

Kept in [`adr/`](./adr). One per decision that added a runtime dependency, or
that a future reader would otherwise reopen.

| ADR | Decision |
|---|---|
| [`0001`](./adr/0001-hash-wasm-argon2id.md) | `hash-wasm` for Argon2id password hashing. |
| [`0002`](./adr/0002-s3-filestore-dependency.md) | The S3 file store's dependency, and its amendment on implementation. |
| [`0003`](./adr/0003-jsquash-image-codecs.md) | `@jsquash` for decoding and re-encoding uploaded images. |
| [`0004`](./adr/0004-mysql2-import-reader.md) | `mysql2` for reading a MyBB board, loaded dynamically. |

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
