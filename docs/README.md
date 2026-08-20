# Documentation

This folder is the documentation for Meith. The same files are published at
[meith.dev/docs](https://www.meith.dev/docs) — the site renders them at build
time, so there is only one copy to edit.

The set is organised by who is reading, because a board is run by more than
one kind of person. **Setting one up** is a job for whichever volunteer has a
free evening; **using one** — the organiser's, the moderator's and the
memberships guides — needs nothing but a browser; **running the server** and
everything after it is for the technically minded.

**New here?** Start with the [Quickstart](./quickstart.md): it takes you from
a rented server to a board on your own domain in about twenty minutes. If
somebody has already set the board up for you, start with
[The organiser's guide](./organiser-guide.md) instead.

## Find your document

| You want to | Read |
|---|---|
| Set up a board for the first time | [Quickstart](./quickstart.md) |
| Run the community's board from a browser | [The organiser's guide](./organiser-guide.md) |
| Approve posts, handle reports, tidy threads | [The moderator's guide](./moderation-guide.md) |
| Take memberships online | [The memberships guide](./membership-guide.md) |
| Run the server day to day | [Running a board](./operating.md) |
| Run more than one web container | [Scaling out](./scaling.md) |
| Move a board to a new version | [Upgrading a board](./upgrading.md) |
| Recover a board whose server is gone | [Disaster recovery](./disaster-recovery.md) |
| Add 2FA, SSO or passkeys | [Signing in](./single-sign-on.md) |
| Run a board in another language | [Languages](./internationalisation.md) |
| Push notifications to a phone | [Web push](./web-push.md) |
| Deploy with Docker Compose, no panel | [Deploying by hand](./self-hosting.md) |
| Run a public demo board | [Demo mode](./demo-mode.md) |
| Write a theme | [The theme API](./theme-api.md) |
| Write a plugin | [The plugin API](./plugin-api.md) |
| Call the REST API | [REST API v1](./rest-api.md) |
| Move a forum off MyBB | [MyBB parity decisions](./mybb-parity.md) |
| Work on Meith itself | [Development](./development.md) |
| Understand how it fits together | [Architecture](./architecture.md) |
| Cut a release | [Releasing](./release.md) |

## Getting started

From a rented server to a board of your own. There are two routes, and they
end at the same board.

| Document | What it covers |
|---|---|
| [`quickstart.md`](./quickstart.md) | **Start here.** The guided route: Coolify on your own server, a board on your own domain in about twenty minutes. |
| [`self-hosting.md`](./self-hosting.md) | The advanced route: Docker Compose, a `.env` you write, and a reverse proxy you run. Most boards should take the Quickstart instead. |

## Using your board

For the people who run the community rather than the server. Everything in
these three guides happens in a browser — no terminal, no code.

| Document | What it covers |
|---|---|
| [`organiser-guide.md`](./organiser-guide.md) | Running the board day to day: forums and the organisers' room, the community's name and colours, announcements, members, and handing it all over. |
| [`moderation-guide.md`](./moderation-guide.md) | The volunteer moderator's handbook: the approval queue, reports, tidying threads, warnings and bans. |
| [`membership-guide.md`](./membership-guide.md) | Taking memberships through the board: plans, discount codes, gifting, the memberships desk and the ledger. |

## Running the server

For whoever minds the machine.

| Document | What it covers |
|---|---|
| [`operating.md`](./operating.md) | The operator handbook: configuration, the CLI, permissions, themes, plugins, mail, spam controls, backups, and troubleshooting. |
| [`upgrading.md`](./upgrading.md) | Moving between versions: the upgrade command, how far you can jump, and the behaviour changes each upgrade brings. |
| [`disaster-recovery.md`](./disaster-recovery.md) | The full-loss runbook: what recovery consumes, the order of operations from provisioning to DNS cutover, and the rehearsal that measures your recovery time. |
| [`single-sign-on.md`](./single-sign-on.md) | Everything beyond a password: two-factor authentication, federated sign-in, passkeys, sessions, and the sign-in activity log. |
| [`internationalisation.md`](./internationalisation.md) | How a page picks its language, how to add one, and how a theme or plugin ships its own words. |
| [`web-push.md`](./web-push.md) | Notifications that reach a member who does not have the board open, the privacy that costs, and the manifest that makes the board installable. |
| [`performance.md`](./performance.md) | The p95 budgets for hot pages and what the last load run measured. *Generated — do not edit.* |
| [`demo-mode.md`](./demo-mode.md) | The self-resetting public demo board that runs at demo.meith.dev, and how to run one yourself. |

## Scaling out

For the board that has outgrown one web container.

| Document | What it covers |
|---|---|
| [`scaling.md`](./scaling.md) | What already scales, the shared Redis cache that keeps several web containers coherent, and the step-by-step migration from a single-instance deployment. |

## Themes, plugins and the API

For the member who codes: extending a board that is already running.

| Document | What it covers |
|---|---|
| [`theme-api.md`](./theme-api.md) | The theme contract: how to write a theme, what a theme may do, and what the API freeze covers. |
| [`theme-slots.md`](./theme-slots.md) | Every slot and every view model. *Generated — do not edit.* |
| [`plugin-api.md`](./plugin-api.md) | The plugin contract: what a plugin is, what it may and may not do, and how failures are contained. |
| [`plugin-hooks.md`](./plugin-hooks.md) | Every hook and payload. *Generated — do not edit.* |
| [`rest-api.md`](./rest-api.md) | Every endpoint, scope and rate limit, and which of them answer without a token. *Generated — do not edit.* |

The machine-readable form is `docs/openapi.json`, an OpenAPI 3 document with a
schema for every request and response. A board serves the same document live at
`/api/v1/openapi.json`. It is generated too, from the same registry, and
generators should be pointed at it rather than at the table above.

## Moving from MyBB

| Document | What it covers |
|---|---|
| [`mybb-parity.md`](./mybb-parity.md) | Every place Meith deliberately behaves differently from MyBB, with the reasoning and the cost. Read it before promising anyone a like-for-like move. |

The importer itself, the legacy-URL redirects and the legacy password upgrade
are covered in [Running a board](./operating.md).

## Working on Meith

| Document | What it covers |
|---|---|
| [`development.md`](./development.md) | **Start here.** Running Meith on your machine, the workspace layout, the commands, and what to do before opening a pull request. |
| [`architecture.md`](./architecture.md) | The system as a whole: processes, layers, the path a request takes, and the extension seams. |
| [`nextjs-conventions.md`](./nextjs-conventions.md) | The codebase's Next.js rules: server components, Server Actions, caching, forms, and the guards that enforce them. |
| [`release.md`](./release.md) | How a release is cut, what it publishes, and the version policy. |

## Generated references

Five documents are generated from the code they describe and must not be edited
by hand:

```sh
pnpm theme:docs      # docs/theme-slots.md   — from the slot registry
pnpm plugin:docs     # docs/plugin-hooks.md  — from the hook registry
pnpm api:docs        # docs/openapi.json     — from the route registry
                     # docs/rest-api.md      — from that OpenAPI document
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
