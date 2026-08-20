# Meith

**A forum for your community, on a server of your own.**
[meith.dev](https://meith.dev)

Meith is forum software for the people who actually run communities: the
admin answering the same question for the fortieth time, the moderator
keeping things civil, the committee posting the notices, the treasurer
chasing the dues, and whoever inherits all of it next. One place the whole
community can reach — the announcements, the decisions, the members-only
forum, the years of answers — at a domain the community owns, on a machine
it rents, handed over whole when the people change.

The name comes from the Irish concept of **meitheal**: neighbours coming
together to help one another with a shared task. Expertise is shared
freely, the heavy lifting is distributed, and the community grows stronger
through cooperation. Meith is that idea as software — for a GAA club, a
residents' association, a guild, a group that outgrew its chat, or any
community that would rather not be somebody else's product.

## Getting started

Meith runs on **your own server**, with nothing between you and the board.
Setting it up is one volunteer's evening; running it afterwards is a
browser. There are two supported routes:

**With Coolify — the guided route.** [Coolify](https://coolify.io) is a
panel you install on your own machine, not a service you sign up to:

```sh
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Point it at this repository — the `release` branch and
[`docker/compose.coolify.yml`](./docker/compose.coolify.yml) — and it pulls
the released image rather than building anything, generates the secrets and
the database password, issues the certificate, and tells the board its own
URL. Nothing is typed in. The [Quickstart](./docs/quickstart.md) walks
through it: a fresh Ubuntu box to a board on your own domain, over HTTPS,
in about twenty minutes.

**With Docker Compose — the advanced route**, if you already run a reverse
proxy. Clone the repository, check out the newest release, write a
five-line `.env` beside [`docker/compose.yml`](./docker/compose.yml), and
`docker compose up -d --build`. [Deploying by hand](./docs/self-hosting.md)
is the walkthrough: the `.env`, the proxy, and what you take on for it.

Either way you get the same four containers — Postgres, a one-shot
migration the others wait on, the web server, and the worker that runs the
background tick. Put a certificate in front, open `/install`, and that is
a board. From there the day-to-day belongs to the people running the
community, not the server: [The organiser's guide](./docs/organiser-guide.md),
[The moderator's guide](./docs/moderation-guide.md) and
[The memberships guide](./docs/membership-guide.md) each need nothing but a
browser. Day two for whoever minds the machine is
[Running a board](./docs/operating.md).

These are the only deployment routes this project supports, and that is a
decision rather than an omission. A board asks three things of wherever it
runs: a scheduler that fires every minute, a disk that survives a restart,
and a process that outlives a request. A plain server gives you all three
without being asked; a serverless host gives you none, and the third has no
workaround at any price.

## What you get

- **A room for everyone, and one for the organisers.** A real permission
  model — 45 permission fields, 26 resolved per member per forum, 19
  board-wide — so newcomers, members and the people running the place each
  see their own forums. Search, feeds and the API all answer to the same
  resolver: there is no path that reads around the rules.
- **Memberships taken online.** Dues ships with the board: plans sold
  through your community's own Stripe account as a subscription, a pass or
  a lifetime. Paying opens the members-only forum by itself and lapsing
  closes it, with a ledger for whoever minds the money at year end. No
  cut, and no per-member fee.
- **Your colours, safely.** The name, logo and colours change from the
  admin panel; a theme fills a frozen, documented slot contract, so a new
  look is replaceable rather than a fork — and can never take the board
  down with it.
- **Years of answers, still findable.** Postgres full-text search,
  weighted so a thread's subject beats a passing mention, and paged on a
  keyset so results never repeat or skip.
- **Bots kept out without bothering people.** A honeypot, a fill-time
  floor, sign-up questions only your members can answer, held first posts,
  and hourly limits counted in the database. No hosted captcha, so no
  third party meets your members before you do.
- **Plugins with contained failures.** Hooks with typed payloads; a plugin
  that throws does not take a page down with it.
- **A migration path from MyBB** — resumable, so a large board can be
  imported across several sessions, with members keeping their passwords.
- **An operator CLI** for whoever minds the machine: migrations, users,
  settings, scheduled tasks, the importer, search reindexing.

## Documentation

Every document lives in [`docs/`](./docs/README.md) and nowhere else. The
site at [meith.dev/docs](https://meith.dev/docs) renders those same files —
it holds no copy of any of them — so a correction is one edit, in the
repository, and both places have it.

The set is organised by who is reading: getting a board set up, using one
from a browser (the organisers, the moderators, whoever minds the money),
running the
server, extending the board, and working on Meith itself.

The table below is written from `apps/web/content/docs.manifest.json` by
`pnpm site:docs`. Describe a document there; do not edit these rows.

<!-- docs:table start — generated by pnpm site:docs; edit the manifest instead -->

| Section | Document | What it answers |
|---|---|---|
| Getting started | [`quickstart.md`](./docs/quickstart.md) | From a rented server to a board on your own domain, with Coolify, in about twenty minutes. Written for whichever volunteer drew the short straw. |
| Getting started | [`self-hosting.md`](./docs/self-hosting.md) | The advanced route: Docker Compose, a `.env` you write, and a reverse proxy you run. Most boards should take the Quickstart instead. |
| Using your board | [`organiser-guide.md`](./docs/organiser-guide.md) | Running the board from a browser: forums and the organisers' room, the community's name and colours, announcements, members — and handing it all over. |
| Using your board | [`moderation-guide.md`](./docs/moderation-guide.md) | For the volunteers who keep it civil: the approval queue, reports, tidying threads, warnings and bans — and where each screen lives. |
| Using your board | [`membership-guide.md`](./docs/membership-guide.md) | Taking memberships through the board: plans, discount codes, gifting, the memberships desk and the ledger — Dues end to end, without a terminal. |
| Running the server | [`operating.md`](./docs/operating.md) | The operator handbook: configuration, the CLI, permissions, themes, plugins, mail, spam controls, backups, and troubleshooting. |
| Running the server | [`upgrading.md`](./docs/upgrading.md) | Moving a board between versions: the upgrade command, how far you can jump, and the behaviour changes each release brings. |
| Running the server | [`disaster-recovery.md`](./docs/disaster-recovery.md) | The runbook for the day the server is gone: what recovery consumes, the order of operations from provisioning to DNS, and the rehearsal that turns it from a hope into a plan. |
| Running the server | [`single-sign-on.md`](./docs/single-sign-on.md) | Two-factor authentication, federated sign-in and passkeys: what each means for your members, how to configure them, and the record of what has opened an account. |
| Running the server | [`internationalisation.md`](./docs/internationalisation.md) | How a page picks its language, how to add one, and how a theme or plugin ships its own words. |
| Running the server | [`web-push.md`](./docs/web-push.md) | Notifications that reach a member who does not have the board open, and the manifest that makes the board installable — what it costs their privacy, and how to turn it on. |
| Running the server | [`performance.md`](./docs/performance.md) | The p95 budgets for the hot pages, and what the last recorded run measured against a full-scale board. *(generated)* |
| Running the server | [`demo-mode.md`](./docs/demo-mode.md) | The self-resetting public demo board that runs at demo.meith.dev — what it changes, and how to run one yourself. |
| Scaling out | [`scaling.md`](./docs/scaling.md) | Running more than one web container: the Redis cache that keeps them coherent, what already scales, and the step-by-step migration from a single-instance board. |
| Themes, plugins and the API | [`theme-api.md`](./docs/theme-api.md) | How to write a theme, what a theme may do, and what the API freeze covers. |
| Themes, plugins and the API | [`theme-slots.md`](./docs/theme-slots.md) | Every slot and every view model, generated from the slot registry. *(generated)* |
| Themes, plugins and the API | [`plugin-api.md`](./docs/plugin-api.md) | What a plugin is, what it may and may not do, and how a failure is contained. |
| Themes, plugins and the API | [`plugin-hooks.md`](./docs/plugin-hooks.md) | Every hook and payload, generated from the hook registry. *(generated)* |
| Themes, plugins and the API | [`rest-api.md`](./docs/rest-api.md) | Every endpoint, scope and rate limit, generated from the route registry. *(generated)* |
| Moving from MyBB | [`mybb-parity.md`](./docs/mybb-parity.md) | Every place Meith deliberately behaves differently from MyBB, with the reasoning and the cost. Read it before promising anyone a like-for-like move. |
| Working on Meith | [`development.md`](./docs/development.md) | Running the board on your own machine, the workspace layout, the commands, and what to do before opening a pull request. |
| Working on Meith | [`architecture.md`](./docs/architecture.md) | How Meith fits together: the processes, the layers, the path a request takes, and the extension seams. |
| Working on Meith | [`nextjs-conventions.md`](./docs/nextjs-conventions.md) | Server components, Server Actions, caching, forms and errors — the decisions that would otherwise be re-litigated in every pull request. |
| Working on Meith | [`release.md`](./docs/release.md) | How a version is cut, what each release publishes — the image, the branch, the npm packages — and the version policy behind the numbers. |

<!-- docs:table end -->

[`docs/README.md`](./docs/README.md) is the same set, indexed for reading
from the repository rather than the site.

## Development

A pnpm workspace. Node 22+, pnpm 10, and nothing else to start:

```sh
pnpm install
pnpm dev
```

That is a working board on <http://localhost:3000> with **no database** — a
deterministic in-memory sample board, enough to read every page and try a
theme. Posting needs Postgres, which is one more command.
[Development](./docs/development.md) is the full walkthrough: the dev
database, the commands, the checks, and what to do before opening a pull
request.

`pnpm verify` is the gate to run before a pull request: the invariant
guards, the generated-doc checks, lint, dependency rules, all three
typecheck projects and the full test suite. If it passes locally, CI's
`static` job — the one a pull request fails first — will pass too; CI's
other jobs build the image and drive a browser.

Four applications share the workspace:

| Directory | Package | What it is |
|---|---|---|
| [`apps/community`](./apps/community) | `@meith/web` | The board itself. `pnpm dev`. |
| [`apps/web`](./apps/web) | `@meith/site` | meith.dev — the landing page and the documentation. `pnpm site:dev`, on port 3100. |
| [`apps/worker`](./apps/worker), [`apps/cli`](./apps/cli) | `@meith/worker`, `@meith/cli` | Background work, and the operator CLI. |

`apps/web` renders `docs/*.md` at build time. It does not copy them, and
there is no second place to update when a document changes.

## Licence

Meith is free software under the **GNU Lesser General Public License,
version 3 or later** — [`LICENSE.md`](./LICENSE.md).

LGPLv3 is not a standalone licence: it is a set of additional permissions
layered on top of the GNU GPL, which it incorporates by reference. That
text is [`COPYING`](./COPYING), and the two files together are the terms.

What it means in practice — a summary with no legal effect of its own, and
not legal advice:

- **Run a board on it, for anything, including commercially.** Nothing
  asks you to publish your configuration, your members' data, or a word
  anybody wrote on your board. Running the software is not distributing
  it.
- **Write a theme or a plugin, and licence it however you like.** A theme
  fills the frozen slot contract; a plugin listens on typed hooks. Both
  use an interface Meith provides rather than becoming part of Meith,
  which is the case the *Lesser* GPL exists to allow. Yours is not obliged
  to be LGPL because the board it runs in is.
- **Change Meith itself, and those changes carry the same licence** to
  whoever you hand the modified version to, along with the source and a
  note of what you changed. That is the copyleft, and it is the whole of
  what is asked in return.
- **There is no warranty.** Sections 15 and 16 of `COPYING` say so at
  length.

The FSF also recommends a notice at the top of each source file. Meith
does not carry them yet; the licence applies to the whole work either way.
The boilerplate is at the end of `COPYING` — insert "Lesser" before
"General" in all three places to refer to the LGPL rather than the GPL.

Copyright (C) 2026 the Meith contributors.
