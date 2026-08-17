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
| `apps/community` | `@meith/web` | The board itself. `pnpm dev`, on port 3000. |
| `apps/web` | `@meith/site` | meith.dev — the landing page and these documents. `pnpm site:dev`, on port 3100. |
| `apps/worker` | `@meith/worker` | The background tick, as a long-running process. |
| `apps/cli` | `@meith/cli` | The operator CLI. `pnpm community …`. |
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
except `docs/perf-indexes.json` and `docs/perf-results.json`, which a
generator writes. Markdown, YAML and SQL have no formatter: Biome does not
format them, so `docs/`, the workflows and the migrations are written by
hand and reviewed as prose.

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

One suite is the exception: `packages/db/src/client.pg.test.ts` needs a
real Postgres *server*, because PGlite bypasses the client driver and has
accepted writes every real server rejected. It skips unless
`TEST_DATABASE_URL` is set:

```sh
docker compose -f docker/compose.dev.yml up -d
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/community_test pnpm test
```

CI's `migrations` job sets it, so "it passed locally" covers everything
except that one seam — and CI covers the seam.

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
| `docs:index:check`, `site:docs:check` | A document in `docs/` that the index does not link, or that is neither published on the site nor explicitly repository-only. |

## The generated documents

Four documents are written from the code they describe and must not be
edited by hand:

```sh
pnpm theme:docs      # docs/theme-slots.md,  from the slot registry
pnpm plugin:docs     # docs/plugin-hooks.md, from the hook registry
pnpm api:docs        # docs/rest-api.md,     from the route registry
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
