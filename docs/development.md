# Development

How to run the board on your own machine — to read the code, write a theme,
or send a patch. This is not how you run a board other people can reach:
that is the [Quickstart](./quickstart.md).

**You need:** Node 22 or newer, pnpm 10, and Docker if you want a real
database.

## Getting it running

```sh
git clone https://github.com/meith-dev/meith.git
cd meith
pnpm install
pnpm dev
```

That is already a working board on <http://localhost:3000>, with **no
database at all** — see [fixture mode](#fixture-mode) below. It is enough to
click through every reading surface, try a theme, and see what the software
is.

For anything that writes — posting, moderation, the installer — you need
Postgres:

```sh
docker compose -f docker/compose.dev.yml up -d    # Postgres on port 55432
cp .env.example .env
```

Set two lines in `.env`:

```sh
DATA_SOURCE=postgres
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/community_test
```

Then migrate and start:

```sh
pnpm community migrate
pnpm dev
```

Open <http://localhost:3000/install> and run the installer — the same one a
real deployment runs. It seals itself when it finishes; on a scratch
database that is fine, and
`docker compose -f docker/compose.dev.yml down -v` gives you a clean one.

The dev compose file uses a named volume, so the board survives the
container being recreated; it is the `-v` that throws the data away.

> [!NOTE]
> The dev database and the e2e suite both use port 55432, so stop the dev
> Postgres (`docker compose -f docker/compose.dev.yml down`) before running
> `pnpm test:e2e`.

### Fixture mode

With no `DATABASE_URL`, `DATA_SOURCE` falls back to `fixture`:
deterministic in-memory repositories with a sample board in them. It is not
a mock layer bolted on for tests — it is a driver behind the same
interfaces as Postgres, and three things depend on it:

- **A fresh checkout runs.** `pnpm install && pnpm dev` needs nothing else,
  which is the difference between somebody trying this project and closing
  the tab.
- **The production build needs no database.** `next build` prerenders, and
  a build that opened a connection would fail wherever the build runs
  before the database is reachable. CI builds in fixture mode; so does the
  Docker image.
- **The test suite is fast**, because most of it never touches a socket.

What fixture mode deliberately does *not* do is fake a write. It has no
installer, no presence store and no statistics store, and each surface that
needs one says so rather than returning a convincing zero.

## The workspace

A pnpm workspace: applications in `apps/`, everything else in `packages/`,
`themes/` and `plugins/`.

| Directory | Package | What it is |
|---|---|---|
| `apps/community` | `@meith/web` | The board itself, and the in-repo dev target. `pnpm dev`, on port 3000. |
| `apps/web` | `@meith/site` | meith.dev — the landing page and these documents. `pnpm site:dev`, on port 3100. |
| `apps/worker` | `@meith/worker` | The background tick, as a long-running process. |
| `apps/cli` | `@meith/cli` | The operator CLI. `pnpm community …`. |
| `boards/stock` | `@meith/board-stock` | A second, create-meith-shaped board — the workspace `docker/Dockerfile` builds the official image from. See [Architecture](./architecture.md#the-stock-board). |
| `packages/*` | `@meith/*` | The domain: accounts, forums, posts, authorization, search, drivers, and the rest. |
| `themes/*` | `@meith/theme-*` | The default theme and four alternates: midnight, phasebook, raidframe, clubhouse. |
| `plugins/*` | `@meith/plugin-*` | Dues (paid membership through Stripe) and the reference plugin. |
| `examples/*` | — | Reference code to copy, not installed: `hello-plugin` and `iris-theme`. See [`examples/README.md`](https://github.com/meith-dev/meith/tree/main/examples). |

> [!TIP]
> The two directory names are easy to swap: `apps/community` is the board
> (package `@meith/web`), while `apps/web` is the marketing site (package
> `@meith/site`).

Every `@meith/*` import resolves through tsconfig path aliases straight to
`src/index.ts`. There is no build step between packages, which is why a
typecheck is fast and why `pnpm workspace:check` exists — see
[the checks that fail on purpose](#the-checks-that-fail-on-purpose).

Outside the workspace: `docker/` is the whole deployment interface — the
compose files, the Dockerfiles, the entrypoint and the healthcheck. The
compose files read their `.env` from beside them, which is why the deploy
guides say `cd meith/docker`. The repository root is a registry, not a
landing zone: every entry in it is listed in `scripts/root-check.mjs` with
the reason it must live there, and `pnpm root:check` fails on a new root
file until it is either moved into a folder or registered with a reason.

How the packages relate — the layers, what may import what, and why — is
[Architecture](./architecture.md).

## Consuming the board from a workspace

`packages/create-meith` scaffolds a board whose `package.json` depends on
`@meith/web` and `@meith/cli` and whose scripts call `forum-web` and
`community` — a board outside this monorepo, in a directory that holds only
its own files: `community.config.ts`, `board.plugins.json`,
`community.plugins.ts` and `package.json`. This section is how that actually
runs, for anyone changing `apps/community`, `apps/cli` or the scaffold and
needing to know what still has to hold true outside this repository.

**A Next.js app is not consumable as a bare dependency.** `next dev|build|start`
need to run with the app's own directory as the project root, and the
[board-config seam](./architecture.md#the-board-config-seam) —
`@board/config` / `@board/plugins` — is a pair of tsconfig path aliases that,
inside this monorepo, point at `apps/community`'s own files. Neither survives
`npm install`ing `@meith/web` into somebody else's workspace unchanged. So
`forum-web` (`apps/community/bin/forum-web.mjs`, `@meith/web`'s bin) and
`community` (`apps/cli/bin/community.mjs`, `@meith/cli`'s bin) **materialize**
the app on every invocation:

1. Copy the package's own Next app sources (or, for `community`, `apps/cli`'s
   sources) into `.meith/app/` (`.meith/cli/` for the CLI) inside the
   invoking workspace — gitignored, rebuilt every run, never a merge target.
   `public/` travels with them, so `/sw.js` and the placeholder assets it
   references are served from the materialized app too.
2. Write a fresh `tsconfig.json` there whose `paths` point `@board/config`
   and `@board/plugins` at *that workspace's own* `community.config.ts` /
   `community.plugins.ts`. A tsconfig path alias is a compiler/bundler alias,
   not a package boundary — nothing stops one from naming a path two
   directories up, which is the whole trick, and it is why this is a
   tsconfig path alias rather than a Node subpath import in the first place:
   a subpath import's target may not resolve outside the declaring package,
   which is exactly what this needs to do.
3. Run `next dev|build|start` (`forum-web`) or `tsx` against the materialized
   entry point (`community`) with that directory as the working root.

**`forum-web build` stages `.next/static` and `public/` into the standalone
tree**, right after `next build` finishes. `next.config.mjs` sets
`output: 'standalone'`, and Next's own standalone output deliberately
excludes both directories — they have to be copied in alongside the traced
`server.js` for it to serve `/_next/static/*` and anything under `public/`
(Next's bundled docs, under `node_modules/next/dist/docs`, say so under
"output"). `forum-web start` only execs that already-staged tree; it does not
re-stage anything itself, so a board's own Dockerfile — which runs `build`
and `start` in the same image, not across a stage boundary — gets a
self-contained standalone tree for free. The official image (`docker/Dockerfile`)
is built differently: its runtime stage is a separate, slimmer image than the
one `forum-web build` ran in, so it copies `.next/static` and `public/` in on
its own, directly from the build stage, rather than relying on `forum-web`'s
staged copy to survive a COPY it does not control.

`.meith/app/` sits exactly two directories below the workspace root on
purpose: `next.config.mjs` computes its own workspace root as two
directories up from itself (for `.env` loading and `outputFileTracingRoot`),
and materializing at that exact depth keeps that computation correct without
touching the file, whether it runs in place inside this monorepo or copied
into somebody else's workspace.

**This assumes a hoisted `node_modules`** — npm, yarn classic, or pnpm with
`node-linker=hoisted` (`create-meith`'s own scaffold uses npm). The
materialized app's source imports every `@meith/*` package it needs by bare
specifier, resolved the ordinary Node way by walking up from `.meith/app/`
looking for `node_modules` — which only reaches a dependency hoisted to the
workspace root. pnpm's default, strict linking nests a package's own
dependencies inside its own `node_modules` entry instead, invisible to that
walk from a sibling directory. `apps/community/next.config.mjs`'s
`transpilePackages` list names every `@meith/*` package this app's
dependency graph reaches for the same underlying reason: inside this
monorepo, every one of them resolves through a tsconfig path alias straight
to its source file, bypassing `node_modules` entirely, so this list used to
be a small, seemingly arbitrary subset. A materialized workspace's generated
tsconfig carries no such alias map — only the seam itself — so every other
`@meith/*` specifier resolves the ordinary way once this package is
installed, and needs the same source-compilation treatment or the build
fails with "Unknown module type" on a `.ts` file inside `node_modules`.

**Fixture mode covers `forum-web dev` and `forum-web build`,** not
`forum-web start`. A production process refuses `QUEUE_DRIVER=memory` —
fixture mode's only queue driver — on purpose
(`packages/core/src/env.ts`): queued work would be lost on every cold start.
Building needs no database (`next build` sets `NEXT_PHASE`, which exempts
it), so a fresh scaffold builds and its dev server runs against fixture data
with nothing configured; running the built, standalone server for real needs
`DATA_SOURCE=postgres` and the same secrets a deployed board needs, exactly
as today.

**The CLI resolves the seam the same way, for a different reason.**
`apps/cli/src/index.ts` reaches `@board/plugins` with a *dynamic*
`await import('@board/plugins')` rather than a static one, so unlike the
released image's own bundled CLI — which bakes in whichever board it was
built next to — the `community` bin needs to resolve that seam at the moment
it actually runs, against whichever workspace invoked it. Materializing
`apps/cli`'s sources and running them with `tsx` (already how `pnpm community`
runs inside this monorepo) against a generated tsconfig is the same
mechanism `forum-web` uses for the Next app, through the tool this package
already runs through.

**The worker is not part of this.** `apps/worker` has no `@board/config` or
`@board/plugins` import anywhere in its source, so it needs none of the
above — and `create-meith`'s scaffold does not depend on `@meith/worker`
today. Giving it its own bin for a scaffolded workspace is orthogonal follow-up
work.

**`scripts/board-workspace-smoke.mts`** (`pnpm board:workspace:smoke`, wired
into CI as the `board-workspace` job) is what proves all of this: it packs
`@meith/web`'s whole dependency closure with `pnpm pack` (the same tool a
release uses, which rewrites `workspace:*` ranges into real ones — none of
this closure is on the real npm registry yet), scaffolds a board with
`create-meith`, installs it with `overrides` pointing every packed name at
its tarball, runs `forum-web build`, applies migrations and boots the
standalone server against a real, disposable Postgres, and asks it for `/`.
It also pulls a real `/_next/static/*` reference out of the rendered HTML and
fetches it, and fetches `/sw.js`, so a standalone build that renders `/` but
serves neither its own script/style bundles nor its service worker fails the
smoke rather than passing it (`scripts/board-smoke-assets.mts`, shared with
`board-deploy-kit-smoke.mts` and `board-eject-smoke.mts`).

## The commands

| Command | What it does |
|---|---|
| `pnpm dev` | The board, on port 3000. |
| `pnpm site:dev` | meith.dev, on port 3100. |
| `pnpm community <command>` | The operator CLI against your `.env`. `--help` lists everything. |
| `pnpm test` | The whole unit suite. `pnpm test:watch` while you work. |
| `pnpm typecheck` | The workspace. `typecheck:app` and `typecheck:site` cover the two Next projects. |
| `pnpm lint` | Biome: formatting, lint rules and import order, in one pass. `pnpm format` writes the fixes. |
| `pnpm verify` | **The full static gate.** Run it before opening a pull request — see below. |
| `pnpm test:e2e` | Playwright: the no-JavaScript paths, the staff panels, and the accessibility checks. It starts its own database and dev servers — nothing to install. |
| `pnpm site:shots` | Re-photographs meith.dev's screenshots against the demo board. Deliberate, never on CI — see [the site's screenshots](#the-sites-screenshots). |

`pnpm verify` is the one that matters. It runs, in order: the workspace and
root checks, `release:check`, the guards and their probes, the message-catalog
check, the slot checks,
the generated-document checks (`theme:docs`, `plugin:docs`, `hooks:wired`,
`api:docs`, `perf:docs`, `docs:index`, `site:docs`), lint,
dependency-cruiser, all three typecheck projects, and the full test suite.
It is a superset of what CI's `static` job runs, so if it passes locally,
that job will pass too. CI's other jobs build the image and drive a
browser.

## Formatting and lint

One tool does both: [Biome](https://biomejs.dev/), configured in `biome.json`
at the root. `pnpm lint` checks formatting, the lint rules and import order
and changes nothing; `pnpm format` writes the fixes. The same command backs
the `lint` script in `apps/community` and `apps/web`, and `pnpm verify` runs
it, so a badly formatted file fails CI the same way a lint error does.

The formatter is not configurable per file: single quotes, no semicolons,
two-space indent, 100 columns. The version is pinned exactly in
`package.json` — a formatter that drifts with a minor bump reformats files
nobody touched.

It covers TypeScript, JSX, JSON and CSS — every such file in the tree
except `docs/perf-indexes.json`, `docs/perf-load.json` and
`docs/perf-results.json`, which a generator writes. Markdown, YAML and SQL
have no formatter: Biome does not format them, so `docs/`, the workflows and
the migrations are written by hand and reviewed as prose.

Three rules carry an invariant rather than a preference:

- **`style/noProcessEnv`.** `process.env` is read in
  `packages/core/src/env.ts` and nowhere else, so every variable is
  validated once at boot. `scripts/`, `apps/cli`, `apps/worker`, config
  files and tests are exempt in `biome.json`; the sanctioned reader carries
  a `biome-ignore` with its reason. `pnpm guards` enforces the same rule
  textually, which is what catches a read in a file Biome does not parse.
- **`scripts/no-group-ids.grit`.** A Biome plugin, registered in
  `biome.json`, that fails on any read of `.groupIds` or `.primaryGroupId`.
  Group IDs must not leak outside `@meith/authorization` — ask the
  Authorizer `can(actor, action, target)` instead of branching on group
  membership. Biome cannot suppress a plugin diagnostic on one line, so the
  modules that legitimately carry a group id as data — the repositories that
  read and write the column, and the admin forms that render it — are named
  by path in the plugin itself.
- **`suspicious/noConsole`.** The board logs through `logger()`. Processes
  that *are* their output — the CLI, the worker, the scripts, the e2e
  harness — are exempt.

Everything else is Biome's recommended set. Where a recommended rule is off
in `biome.json` it is because the codebase means the other thing:

- `noNonNullAssertion` and `useTemplate` are style preferences it does not
  share — the second would rewrite `'mybb$$' + 'a'.repeat(32)` into
  something less readable than it started.
- `noDangerouslySetInnerHtml` would fire on every rendered post body,
  signature and announcement. Rendered HTML comes from `@meith/markdown`
  and nowhere else, which is where that safety argument is settled.
- `noImgElement` would ask for `next/image` on a board that has to run
  without an image optimiser.
- `noImportantStyles` fires on the `prefers-reduced-motion` block, where
  `!important` is the point.
- `useSemanticElements`, `noStaticElementInteractions` and
  `useKeyWithClickEvents` want markup changes to the theme editor, the
  attachment dropzone and the docs search — worth doing, and not as a side
  effect of a formatter change.

A suppression is always a `biome-ignore` with a reason, never a blanket
disable:

```ts
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
```

> [!IMPORTANT]
> **Do not run `pnpm format` in a feature change.** It is safe — the output
> is deterministic — but a whole-tree rewrite buries whatever you were
> actually changing. Format the files you touched, or let your editor do it
> on save.

## The database in tests

`pnpm test` needs no database. Repository tests, migrations, anything
asserting on real SQL — all of it runs against PGlite, a real Postgres
compiled to WebAssembly, booted in-process per suite with the checked-in
migration SQL applied.

Two suites are the exception — the `*.pg.test.ts` files, which need a real
Postgres *server*. `packages/db/src/client.pg.test.ts` is there because
PGlite bypasses the client driver and has accepted writes every real server
rejected; `packages/db/src/migrate.pg.test.ts` is there because PGlite
serves one backend and the thing under test is two connections contending
for a lock. Both skip unless `TEST_DATABASE_URL` is set:

```sh
docker compose -f docker/compose.dev.yml up -d
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/community_test pnpm test
```

CI's `migrations` job sets it, so "it passed locally" covers everything
except those seams — and CI covers them.

## Coverage

`pnpm test:coverage` runs the unit and integration suite with V8 coverage and
writes the detailed HTML report to `coverage/index.html`. CI runs the same
command as a required gate, prints the summary in the job log, and uploads the
whole `coverage/` directory as the `coverage-report` artifact.

The global thresholds prevent repository-wide regressions. Separate floors for
the worker, polls, attachments, and UI packages keep well-tested packages from
hiding a decline in those areas. Thresholds are a ratchet: raise them when the
measured baseline improves, and do not lower them without documenting the
reason in the same change.

`packages/drafts` contains only TypeScript interfaces, which are erased before
runtime and therefore have no runtime coverage denominator. Its repository and
immutable draft contracts are checked by `index.type-test.ts`; add a package
coverage floor when runtime behavior is introduced.

## The browser suite

`pnpm test:e2e` starts everything it needs: a PGlite serving the Postgres
wire protocol, a `next dev` server against it, and a second empty database
and server for `/install`. There is nothing to install and nothing to leave
running.

**Most specs run with JavaScript disabled** — 31 of the 42 spec files. That
is the point rather than a flourish: this board's claim is that a native
`<form>` does the work and the islands are optional, so a suite that tested
only the enhanced path would prove the opposite. The JS-on specs are the
ones whose subject needs scripting — accessibility, passkeys, the content
security policy, the API, syndication, the screenshot tours — plus
`admin-panel-live.spec.ts`, below.

A spec that needs a member **registers through the form**: the seeded
accounts carry a hash nothing can match, so the only way in is the way a
member takes. A spec that needs *staff* cannot do that, because a
registration always lands in the Registered group, so two accounts are
seeded with a real password, both named in `e2e/support/config.ts`:

| Account | Group | For |
|---|---|---|
| `admin` | Administrators | The control panel. Bypasses forum permissions. |
| `e2e_moderator` | Super Moderators | Moderation. Deliberately **not** an administrator, so the specs prove the moderator's own path rather than the bypass — and prove the panel is shut to them. |

Use `signUp`, `signInAsModerator` and `enterAdminPanel` from
`e2e/support/session.ts` rather than repeating the forms. `signUp` also
asserts the username fits the board's 30-character maximum, because the
registration input silently truncates a longer one and the sign-in that
follows then fails with "Incorrect username or password".

**`admin-panel-live.spec.ts` runs with scripting on**, and it is an
exception the rule needs. With scripting off, a form post is a full
navigation, so the page re-renders whatever the action did about caching —
which makes a no-JS suite blind to a panel screen that does not refresh its
own list. That blindness was hiding four of them.

**The suite shares one database across every spec, in file order.** A spec
that changes something every page shows — a board-wide announcement, a
board setting, a pinned thread — must put it back, or a later file fails
for a reason nothing in that file can explain.

It shares the **scheduler** too, and that catches specs the database rule
does not. A spec waiting on background work — an avatar re-encode, the
search index — drives it by calling `/api/system/tick`, but a task only
runs when its interval is up: `queue.drain` runs every sixty seconds. Run
alone, a spec passes because a task that has never run is due immediately;
run after anything that ticked, the same wait can need a full interval.
Give such a spec its own `test.setTimeout` longer than the wait it asks
for — Playwright's default is thirty seconds, and a `toPass` budget larger
than the test timeout is a budget that cannot be spent.

The specs are typechecked by `pnpm typecheck` along with everything else.
Playwright transpiles TypeScript without checking it, so until `e2e/` was
added to the root tsconfig project, a spec that did not compile failed only
when it ran — and a support file that did not compile never failed at all.

**Passing is not enough — the run also fails on what the board logged.**
`e2e/support/server-errors.ts` is a reporter that reads the dev server's
output and fails the run on any unhandled server error, however many tests
passed. It exists because a green run was once hiding fifty-six: every
control-panel page threw a `ForbiddenError` on a visit its layout had
already answered with the sign-in form, and every spec asserting on that
form passed over the top of it.

## The site's screenshots

Every image on meith.dev is a screenshot of a real board rather than an
illustration, and `pnpm site:shots` is what takes them. They land in
`apps/web/public/shots`, and the site references them by name, so a rename
there is a broken image on the page.

It photographs the **demo board** — the twenty forums of `packages/demo`,
all five themes, and the Dues shop — rather than the fixture the behaviour
specs run on, whose content is written to be asserted rather than looked
at. That needs a different board on different ports, so it has a config of
its own (`e2e/screenshot-site.config.ts`) rather than a project in
`playwright.config.ts` — folding it in would boot all of that on every
`pnpm test:e2e` run to serve one spec that asserts nothing.

**It does not run on CI**, deliberately. The shots change whenever the
seed's relative timestamps move, so a run on every push would put megabytes
of visually identical PNGs into every pull request. Re-take them when the
board's appearance actually changes, and commit only the images that
differ.

Four facts about the demo board decide how the shots are taken, and each is
asserted in `e2e/screenshot-site.spec.ts` rather than left to hold on its
own:

- **The demo strip publishes `admin / admin`** at the top of every page. It
  is hidden before each shot, and the run fails if the selector stops
  matching — those credentials on a marketing page would read as a security
  hole.
- **The seed holds a spam thread in the moderation queue**, and an
  administrator can see unapproved content. The shots are taken as
  `member`, or the board's own "Latest threads" panel leads on cheap
  replica jerseys.
- **A freshly seeded board has done no background work.** Nothing is
  indexed and every counter is zero, which two themes render as "not
  counted yet" beside three noughts. The scheduler is driven until search
  answers before anything is photographed.
- **Search is rate-limited.** `/search?q=` runs a flood-checked search and
  redirects to a stored result set, so the light-and-dark pair is taken
  from that stored `/search/<token>` URL — asking the search route twice
  returns the form carrying a rate-limit warning.

## The checks that fail on purpose

Several gates in `pnpm verify` exist because something once passed every
other check and broke on a clean install. Each one checks a fact about the
repository that nothing else reads:

| Script | What it catches |
|---|---|
| `workspace:check` | A package directory with sources and no `package.json`, or a manifest the lockfile has not seen. Both pass every other gate and fail `pnpm install --frozen-lockfile`, which is CI's first step. |
| `root:check` | A new file at the repository root. The root is an interface — every entry is registered with the reason it must live there. |
| `release:check` | A version written anywhere that disagrees with the release version, or a published package depending on a private one. See [Releasing](./release.md). |
| `guards` | Textual invariants — the things a grep can prove and a type cannot. `guards:probe` proves each guard still fires. |
| `i18n:check` | A message the code names and the catalog does not carry, a message nothing reads any more, a mirrored setting label that has drifted from the catalog, or a view builder that gained a hardcoded English string. See [Languages](./internationalisation.md). |
| `slots:check` | The server/client boundary in theme slots, in both directions. |
| `hooks:wired` | A hook fired by name that the registry does not declare — the typo that would otherwise be a call nothing listens to. It also derives the wired/unwired list that `pnpm plugin:docs` publishes. |
| `theme:docs:check`, `plugin:docs:check`, `api:docs:check`, `perf:docs:check` | A generated reference that has drifted from the code it describes. |
| `board:gen:check` | Either board's `community.plugins.ts` out of step with its `board.plugins.json` — see [the plugin API](./plugin-api.md#writing-a-plugin) and [the board plugin manifests](#the-board-plugin-manifests). |
| `docs:index:check`, `site:docs:check` | A document in `docs/` that the index does not link, or that is neither published on the site nor explicitly repository-only. |

## The board plugin manifests

This repository carries two boards, and each has its own
`board.plugins.json` and generated `community.plugins.ts`: `apps/community`,
the in-repo dev target, and `boards/stock`, the workspace
`docker/Dockerfile` builds the official image from. `tests/boards-stock.test.ts`
requires the two manifests to stay identical, so a plugin installed into one
and not the other fails `pnpm verify`.

`scripts/boards.json` is the one place that list of boards is written down.
Both `scripts/board-plugins-gen.mjs` (`pnpm board:gen`) and
`apps/cli/src/plugin-manifest.ts` (`community plugin:add` / `plugin:remove`)
read it, so a board added there is picked up by both without a second list
to keep in step. Installing a plugin in this checkout means adding the
dependency to both boards — see
[the plugin API](./plugin-api.md#writing-a-plugin).

`MEITH_BOARD_PLUGINS_ROOT` overrides the directory those manifests,
`package.json` files and generated files are read from and written to; the
generator inherits it from the CLI when the CLI shells out. Only the tests
set it, pointing at a throwaway fixture tree so a real add-and-remove round
trip never edits this checkout's own boards. Unset — which is what any real
run leaves it — both fall back to the repository root.

## The generated documents

Five documents are written from the code they describe and must not be
edited by hand:

```sh
pnpm theme:docs      # docs/theme-slots.md,  from the slot registry
pnpm plugin:docs     # docs/plugin-hooks.md, from the hook registry
pnpm api:docs        # docs/openapi.json,    from the route registry
                     # docs/rest-api.md,     from that OpenAPI document
pnpm perf:docs       # docs/performance.md,  from the last load run
```

`pnpm verify` fails when one is stale, deliberately: a reference read by
somebody who cannot see the source is worse than no reference when it is
wrong.

## The documentation itself

`docs/*.md` is the one editable copy. The site at
[meith.dev/docs](https://www.meith.dev/docs) renders those same files at
build time and holds no copy of any of them, so a correction is one edit in
one place.

Adding a document means putting it in `docs/`, naming it in
`apps/web/content/docs.manifest.json` — under `documents` to publish it, or
`internal` to keep it repository-only — linking it from
[`docs/README.md`](./README.md), and running:

```sh
pnpm site:docs      # rewrites the documentation table in the root README and checks the set
```

Both index checks fail on a file that is in neither list, so a new document
cannot quietly go unlinked.

## Before opening a pull request

1. `pnpm verify` passes.
2. New behaviour has a test that fails without it.
3. You have read [Next.js conventions](./nextjs-conventions.md) — the
   decisions that would otherwise be re-litigated in every review.

## Where to read next

| You want | Read |
|---|---|
| How the system fits together | [Architecture](./architecture.md) |
| The conventions this codebase holds to | [Next.js conventions](./nextjs-conventions.md) |
| To write a theme | [The theme API](./theme-api.md) |
| To write a plugin | [The plugin API](./plugin-api.md) |
