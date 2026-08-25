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
into somebody else's workspace. `next.config.mjs` points `turbopack.root` at
the same workspace root for the same reason — left unset, Turbopack infers a
project root by walking up for a lockfile and otherwise stops at this app's
own directory, and its transform pool (postcss, for instance) then cannot
see the invoking workspace's `node_modules` at all, failing with "Cannot
find module" for a dependency plain Node resolution finds without trouble.

`outputFileTracingIncludes` works around a narrower gap in the standalone
build: Next's output-file tracer only follows the CJS half of `@swc/helpers`'
dual package and misses the `esm/` variant next's own require-hook resolves
at runtime, so the standalone tree would otherwise ship a `@swc/helpers`
directory missing its esm half. Next resolves that package through its own
nested pnpm store entry — a symlink into the real `@swc+helpers` store
entry — so that symlink target is what has to be traced in, not the app's
own copy. The glob is written relative to `next.config.mjs`'s own directory,
not the workspace root, because unlike `outputFileTracingRoot` and
`turbopack.root` this option resolves its globs against the config file's
own directory.

**That store path spells the version out, so a check holds it in step.** A
pnpm store entry is named for its version, and the glob has to name the
directory exactly — there is nothing to derive it from at config load, because
`next.config.mjs` is read from places where `@swc/helpers` does not resolve at
all: pnpm's strict linking puts nothing at the workspace root, so neither the
materialized copy at `.meith/app` nor the one `forum-web build --at-root`
leaves at the root can resolve the package whose version the glob needs. A
derivation there would fall back to a glob matching nothing, which is the
failure this works around in the first place. So the literal stays, and
`scripts/workspace-check.mjs` refuses a tree where it disagrees with the
`@swc/helpers` pin in any manifest that declares one — naming both sides, the
same way it holds `next`, `react` and `react-dom` to `@meith/web`. Without it
a bumped pin leaves the glob matching an entry that is no longer there and
nothing fails until a request reaches the standalone server, which is the
worst place to learn it. The check reads both configs that carry the literal
(`apps/community` and `apps/web`) and fails just as loudly if either stops
carrying one at all. The second, unversioned glob beside it covers the hoisted
layout npm installs, where no `.pnpm` directory exists for the first to match.

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
`@meith/web` itself is in that list for the same reason, even though
`apps/community` never imports its own package by name inside this
monorepo — a materialized workspace's `community.config.ts` reaches it
through the `@meith/web/config` subpath, which is real only once npm has
resolved this package into another workspace's `node_modules`.

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

### Building where Vercel looks

`forum-web build --at-root` materializes into the workspace root itself
(`<root>`, depth zero) instead of `.meith/app`, so `next build` writes its
artefact to `<root>/.next`. That is the one shape Vercel's Next.js preset can
read, and it is the only reason the mode exists.

Three constraints, none of them ours to change, close off every other
arrangement:

- **The builder reads `.next` under the project root**, and for a Next.js
  project that location is not configurable — unlike every other framework
  preset, where an Output Directory setting exists. A build that leaves its
  output at `.meith/app/.next` is invisible to it, and the deploy fails
  reporting no output rather than reporting a wrong path.
- **The Root Directory cannot be `.meith/app`.** Vercel resolves it against
  the *checkout*, before install, and `.meith/app` does not exist until
  `forum-web` has run. Framework detection then runs against a directory that
  is not there. Materializing during a postinstall step does not help either:
  detection has already happened by then.
- **`.next` cannot be moved after the build.** `required-server-files.json`
  records the app directory and the paths every traced file was recorded
  relative to, so relocating the directory invalidates them. That failure
  arrives at request time on the deployed board, not at build time in CI,
  which makes it strictly worse than the problem it would be fixing.

So the app moves, not the output. Nothing about the
[board-config seam](./architecture.md#the-board-config-seam) changes — every
path `forum-web` writes is computed from the materialization directory rather
than assumed, so at depth zero the generated tsconfig's `paths` simply name
`./community.config.ts` where at depth two they named `../../community.config.ts`.
Three things that used to be able to rely on the depth are now told the answer
instead:

- **`FORUM_WORKSPACE_ROOT` is always passed on** by `forum-web`, defaulting to
  the invoking workspace's own root. At depth two it equals what the copied
  `next.config.mjs` computes for itself, so nothing changes; at depth zero it
  is what stops that file resolving a workspace root two directories *above*
  the board. `boards/stock`'s own value still wins, exactly as before.
- **`outputFileTracingIncludes`' glob prefix** is `.` rather than the empty
  string when `next.config.mjs` already sits at the workspace root — an empty
  prefix produces a leading `/`, which reads as an absolute path and silently
  matches nothing.
- **`globals.css`'s Tailwind `@source` roots are rebased on every
  materialization**, not only when `FORUM_WORKSPACE_ROOT` was set externally.
  At depth two the rebase reproduces the file's own paths byte for byte; at
  depth zero it is what keeps `themes/`, `plugins/`, `examples/` and
  `packages/ui/src` pointing inside the board instead of two directories above
  it.

**Depth zero puts framework-owned names beside the board's own files**, which
`.meith/app` never did, so ownership there is decided per *file* rather than per
top-level name. `.meith/app` is replaced wholesale on every run and that is
still exactly what happens at depth two; at depth zero, `rm -rf public/` would
take a board's own `public/ads.txt` with it. Instead, `--at-root` expands the
shipped entries file by file and, for each file it is about to write, treats it
as its own when either the record in `.meith/materialized.json` says it wrote
that file before, or what is on disk is byte for byte what it would write
anyway. Everything else is the board's: never removed, never overwritten, and
any collision stops the build listing every file involved. `tsconfig.json` and
`next-env.d.ts` are the exception and have to be — they are generated rather
than copied, so there is no shipped file to compare against and nothing to
distinguish a board's own from a stale one this bin wrote. Both are replaced
without asking, which means a board cannot keep its own compiler options at
the root of an `--at-root` workspace. Files the record
names and this run will not write — the framework stopped shipping them — are
removed, and only those. Nothing the board added is ever in the record, which is
why removal is driven from the record and not from the directory.

The byte-comparison is what makes a fresh checkout work. A clone has no record,
so without it every committed framework file would read as the board's and fail
the deploy; with it, a file identical to the one being written is simply
written again. A *modified* copy still fails, which is right — that edit would
otherwise be silently discarded on every build.

It leaves one narrow hole, open deliberately. A board file that happens to be
byte-identical to a shipped one is indistinguishable from a materialized copy,
so it is recorded as this bin's own; if a later release stops shipping that
name, the stale-removal pass deletes the board's file. That needs exact
byte-identity with a file the framework ships and then drops, and closing it
would mean giving up the fresh-checkout case that makes deploys work at all.

**`app/` and `src/` are the framework's alone, and a scaffolded board
gitignores them as a unit.** Per-file ownership means a route dropped into
`app/` is *preserved* rather than refused — and then never committed, so it
works locally and is absent from a deploy built out of the checkout. Neither
git nor Next can catch that, so `forum-web` warns at materialization time,
naming every file it finds under those directories that is not its own. A
board extends the forum through plugins and themes, which `community.config.ts`
names and git tracks.

**A board can therefore own files under `public/`.** `robots.txt`,
`sitemap.xml` and the board's branding are routes rather than files here, but
`ads.txt`, `.well-known/` and domain-verification files are not, and they have
to live somewhere. The Vercel target's `.gitignore` lists `public/` file by
file (`MATERIALIZED_PUBLIC`) instead of as a directory for exactly that reason,
so a board's own additions there are tracked normally. The other nine names the
framework owns outright and they are ignored as a unit. The self-host target's
`.gitignore` lists none of them — nothing there ever materializes at the root,
and listing them would only untrack a board's own `src/`. Neither does its
`.dockerignore`: that file governs `COPY . .`, and a board that grows a
top-level `src/` or `public/` needs it in the image.
`scripts/workspace-check.mjs` fails if `MATERIALIZED_AT_ROOT` and `forum-web`'s
own `APP_ENTRIES` ever disagree — the drift would otherwise show up as a
framework file committed into somebody's board.

**Framework detection is a manifest read, not a resolution.** Vercel looks for
`next` in the root `package.json`'s `dependencies` or `devDependencies` and
reports "No Next.js version detected" when it is absent — setting
`"framework": "nextjs"` selects the preset but does not answer that question.
A scaffolded board did not declare `next`: it never needed to, because a hoisted
`node_modules` puts `@meith/web`'s own copy at the workspace root where the
materialized app's bare `next` imports resolve to it anyway. `boards/stock`
declares `next`, `react` and `react-dom` directly for the opposite reason — this
monorepo's pnpm install is not hoisted, so a workspace member only sees what it
declares itself (see [The stock board](./architecture.md#the-stock-board)).
Neither of those is about detection. The scaffold now declares `next`, and only
`next`, at the version `@meith/web` builds with: `react` and `react-dom` still
arrive by hoisting, and every pin that does not have to exist is a pin that can
drift.

That version is a literal a release does not move, so
`scripts/workspace-check.mjs` holds it in step instead: every workspace manifest
that pins `next`, `react` or `react-dom` must pin what `@meith/web` pins, and so
must `create-meith`'s `NEXT_VERSION`. Upgrading Next in `apps/community` and
nowhere else now fails the check rather than shipping a scaffold that installs
one version of the framework and builds with another.

**The Vercel target turns the mode on; nothing else does.** `scaffold()`'s
`target: 'vercel'` tree is where the flag lives — `vercel.json`'s `buildCommand`
(`community migrate && forum-web build --at-root`) is what Vercel actually runs,
and the same tree's `dev`, `build` and `start` scripts carry it too, so a board
built locally and a board built on the platform materialize to the same place
rather than quietly disagreeing. The self-host target is untouched: its scripts,
its `.meith/app` artefact and its standalone tree are exactly what they were.
`pnpm vercel-template:gen:check` ties the generated `templates/vercel/` tree back
to `scaffold()`, and `scripts/workspace-check.mjs` ties `scaffold()`'s
`NEXT_VERSION` back to `@meith/web`'s — so the `next` version the deploy form
installs cannot drift from the one the board is built with, in either link.

**What a board deployed this way still is.** `--at-root` changes where the app
is materialized and nothing else: same sources, same seam, same
`output: 'standalone'`, same fixture-mode build with no database. `forum-web
start` works there too — the standalone tree lands at `<root>/.next/standalone`
rather than nested — but a board on Vercel never runs it, since the platform
serves the traced output itself.

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
| `pnpm test:e2e` | Playwright: the no-JavaScript paths, the staff panels, and the accessibility checks. It builds the board and runs the standalone output against its own databases — nothing to install. `pnpm test:e2e:build` is the build on its own. |
| `pnpm site:shots` | Re-photographs meith.dev's screenshots against the demo board. Deliberate, never on CI — see [the site's screenshots](#the-sites-screenshots). |

`pnpm verify` is the one that matters. It runs, in order: the workspace and
root checks, `release:check`, the guards and their probes, the message-catalog
check, the slot checks,
the generated-document and documentation checks (`theme:docs`, `plugin:docs`, `hooks:wired`,
`api:docs`, `perf:docs`, `docs:index`, `docs:links`, `site:docs`), lint,
dependency-cruiser, all three typecheck projects, and the full test suite.
It covers every gate in CI's `static` job but two. That job also packs every
publishable package and checks each tarball against its manifest
(`node scripts/npm-publish.mjs --dry-run`), and it runs the suite exactly once,
under coverage — so the thresholds are judged there and not by `pnpm verify`.
Run `pnpm test:coverage` yourself before a pull request that moves what is
covered. CI's other jobs build the image and drive a browser.

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

The `*.pg.test.ts` files are the exception — they need a real Postgres
*server*. `packages/db/src/client.pg.test.ts` is there because PGlite
bypasses the client driver and has accepted writes every real server
rejected; `packages/db/src/migrate.pg.test.ts` and
`packages/db/src/install-repo.pg.test.ts` are there because PGlite serves
one backend and the thing under test is two connections contending for a
session-level lock.

`packages/testkit/src/postgres-queue-pooled.pg.test.ts` is there for the
same reason one step further out, and it is worth knowing why a fake will
not do. Standing a wire server in front of a single PGlite instance funnels
every client's protocol messages into one backend, which owns exactly one
unnamed prepared statement — the statement `prepare: false` makes the board
use. Two connections issuing parameterised queries at once interleave their
Parse and Bind, one overwrites the other's unnamed statement, and Postgres
answers `08P01: bind message supplies N parameters, but prepared statement
"" requires 0`. That says nothing about the queue: it is the fake sharing
the one piece of session state separate connections must never share, which
is the opposite of what a transaction pooler does. Only a real server gives
each connection its own backend.

They all skip unless `TEST_DATABASE_URL` is set:

```sh
docker compose -f docker/compose.dev.yml up -d
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/community_test pnpm test
```

CI's `migrations` job sets it, so "it passed locally" covers everything
except those seams — and CI covers them.

## Coverage

`pnpm test:coverage` runs the unit and integration suite with V8 coverage and
writes the detailed HTML report to `coverage/index.html`. CI's `static` job runs
that command and nothing else in that job runs the suite: `--coverage` decides
what is *measured*, never what is collected, so this is `pnpm test` plus the
thresholds rather than a second pass over the same tests. The job prints the
summary in its log and uploads the whole `coverage/` directory as the
`coverage-report` artifact. The `migrations` job runs `pnpm test` separately,
with `TEST_DATABASE_URL` set, for the seams that need a real Postgres.

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
wire protocol, a built server running the standalone output against it, and
a second empty database and server for `/install`. There is nothing to
install and nothing to leave running.

**Most specs run with JavaScript disabled** — 33 of the 48 spec files. That
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

### A red browser shard is often not about your change

The shard `No-JS and accessibility browser checks (1)` failed seven times
across five pull requests in one afternoon, passing on re-run every time
with no code change — once on a documentation-only branch that touches no
code at all. If a browser shard goes red and the diff cannot explain it,
the first move is to read this section rather than to reach for the
locator.

**The mechanism is the dev server's memory, not the assertion.** The suite
drives `next dev`, which compiles each route on first request and holds
every route it has compiled for the life of the run. Measured locally on a
four-core machine, the pair of dev servers reaches **10.1 GB** of resident
memory by the end of shard 1. A CI runner has 16 GB and is also hosting
Chromium, two PGlite databases and a second dev server. The shard finishes
within a couple of gigabytes of the ceiling, and the late tests visibly
slow down as it approaches — which is what `ci.yml` already describes when
it explains why the suite is sharded at all.

Under that pressure a test fails for reasons its own code cannot explain:
a compile stalls, or the dev server restarts and serves a route it has not
finished rebuilding. The failure lands on **whichever test is in flight**,
so the reported spec varies between runs. Reproduced locally by pinning the
suite to half the machine's cores, shard 1 produced `1 failed, 55 passed`
— the same shape CI reports, with a different victim than CI's.

**What this is not.** `admin-panel-live.spec.ts` was blamed for a long time
because it is a frequent victim, and one measurement seemed to convict it:
the ban test takes twelve seconds against a fifteen-second assertion
timeout. Those are two different budgets. Twelve seconds is the whole
test — a registration in a second browser context, an administrator sign-in,
the panel's password proof, and two routes compiled for the first time. The
assertion the failure names, `Banned until`, resolves in **355 ms** idle and
under a second at half CPU. It has never been close to its timeout, and no
change to that locator or that budget would have prevented a single one of
those seven failures.

That test is a frequent victim rather than a culprit for a structural
reason: it is the first test in shard 1 to reach `/admin/users/[id]`, so it
pays that route's first compile every run, and it is scripting-on, so
its button does nothing until the page has hydrated. It is exposed to a
dev-server stall in a way a no-JS spec is not.

**The board project no longer retries.** It retried once on CI while the
dev server was the mechanism; the built server below removes that
mechanism, and the retry came out with it, as it was always meant to. A
retry is containment, and containment for a cause that no longer exists is
a standing mask over the next real one. The suite is deterministic now, so
a browser test that fails twice out of ten runs is a signal — usually a
genuine race in the test or the product, of the kind the `removeRow` fix
above turned out to be — and it should be read rather than retried.

`e2e/support/flaky-notice.ts` stays wired up. With no retries configured it
never fires, but the moment anyone reaches for `--retries=1` to triage a
suspected flake it prints a GitHub Actions warning naming every test that
failed and then passed, so **green with a flaky warning is never mistaken
for green**. That is worth keeping as a standing property rather than
deleting alongside the setting it was introduced with.

Two things worth knowing before changing anything in this area:

- `DATABASE_POOL_MAX` is `1` for the suite, so making a server action's
  queries concurrent with `Promise.all` does not make them parallel — they
  serialise on the single connection.
- `experimental.turbopackFileSystemCacheForDev` is left at Next's default,
  which is on. Turning it off keeps Turbopack's whole dev cache in memory,
  which pushes the shard towards the ceiling above. The stale-cache problem
  that argues for turning it off needs a `.next` directory restored from a
  previous run, and CI never caches `.next-e2e`.

### The browser suite runs against a built server

**The suite no longer drives `next dev`.** That was the mechanism above, and
a built server removes it rather than containing it: it compiles nothing at
request time, so it has nothing to hold. Measured on the same four-core
machine, at the same half the cores, against shard 1:

| | `next dev` | built server |
|---|---|---|
| Server memory, both servers | 10.1 GB — 7.1 GB once the cache default was restored | flat at **0.58 GB** |
| Shard 1 wall-clock | 7.9 min | **2.6 min**, plus the build |
| The ban test | 14.3 s | **4.9 s** |

Ten consecutive runs of shard 1, pinned to half the cores on a machine
running other work, were green — the same shard whose failures started all
of this.

`pnpm test:e2e` builds first and then runs Playwright. The build is
`e2e/support/board-build.ts`; it needs no database, because every route is
`ƒ (Dynamic)` and nothing is prerendered. A cold build takes about 75 s and
an unchanged rebuild about 12 s, so running the suite twice in a row does
not pay for the build twice.

**Both servers are one build.** `FORUM_DIST_DIR` gave the board and the
install server separate `next dev` compile caches; a built server has no
compile cache, so the two now run the same `server.js` from the same
`.next-e2e/standalone` tree and differ only in `PORT`, `DATABASE_URL` and
`UPLOADS_DIR`. Running `npx playwright test` directly skips the build and
serves whatever was built last.

**Running the standalone output, not `next start`.** `output: 'standalone'`
makes `next start` warn and serve anyway. The suite instead does what
`forum-web start` does (`apps/community/bin/forum-web.mjs`): run
`node .next-e2e/standalone/apps/community/server.js`. Next does not copy
`static` or `public` into that tree, so `board-build.ts` stages both
afterwards for the same reason and in the same way `forum-web build` does —
see [Consuming the board from a
workspace](#consuming-the-board-from-a-workspace). The generated `server.js`
bakes its own config in and reads `PORT` and `HOSTNAME` from the
environment.

**A built server is production, and three harness assumptions broke on
that.** None of them was a product bug, and none was fixed by loosening the
product:

- `account-security-no-js.spec.ts` read the password-reset token straight
  off the page, which `auth-actions.ts` returns only when `NODE_ENV` is
  `development` — correctly, and that stays. The spec now reads the token
  out of the **e-mail**, which is how a member actually receives it:
  `MAIL_DRIVER=http` points the board at `e2e/support/fake-mail.ts`, a fake
  provider endpoint beside the Stripe and marketplace fakes, and
  `e2e/support/mailbox.ts` reads its inbox back. This tests more than the
  page ever did — the reset mail is now exercised end to end.
- Mail carries a link only when the board knows its own address, and the
  e2e board deliberately has none: `admin-panel-live.spec.ts` asserts the
  "does not know its own address" warning, and `passkeys.spec.ts` reaches
  the board as `localhost` because Chrome refuses an IP for a passkey.
  Seeding `board.url`, or setting `APP_URL`, breaks both. So the one test
  that needs an address sets it through the panel and puts it back — the
  suite is `workers: 1`, `fullyParallel: false`, so that is serial and safe.
- In production the session cookies are `__Host-` prefixed and `Secure`.
  Chromium sends those over `http://127.0.0.1` because loopback is a secure
  context, but Playwright's `page.request` will not — so a route reached
  that way saw an anonymous visitor. `signedHeaders()` in
  `e2e/support/session.ts` attaches the context's cookies to those calls.
  To drop one such cookie, prefer `clearCookies({ name })` over reading the
  jar, clearing it and adding the rest back: it does that filtering for you.

**A known pre-existing order dependency.** Run serially in one process,
`admin-tabs-no-js.spec.ts` leaves something behind that makes
`formatting-no-js.spec.ts`'s server-side highlighting and
`formatting.spec.ts`'s attachment rendering fail. It is **not** caused by
the built server — it reproduces identically against `next dev` — and CI
does not see it, because Playwright shards by file and those specs land in
shard 1 and shard 2. It is recorded here rather than fixed, because it is a
different bug from this one.

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
| `docs:links:check` | An internal link or anchor under `docs/` that resolves to nothing — a renamed heading, a moved file, or a section that never existed. It also checks the `doc`/`anchor` pairs `apps/web` links back into `docs/`. See [documentation links](#documentation-links). |

Three of those gates read the working tree rather than the index, so a
directory a tool leaves behind is a directory they scan. `root:check` walks
the root and tolerates an unregistered entry only when git ignores that entry
itself — ignoring a subdirectory of it is not enough. `guards` and
`i18n:check` share the walker in `scripts/repo-files.mjs`, which skips build
and tooling output by name: `node_modules`, `dist`, `coverage` and their kind,
plus `.meith` — the app `forum-web` materializes into a board workspace — and
`.claude`, where an agent run keeps a full checkout of this repository per
agent. Without those two, a local build or a parallel agent run makes every
guard fire against copies of the repository instead of the repository. A new
tool that writes into the tree belongs in both that list and `.gitignore`.

## Documentation links

The site publishes `docs/` directly, so a heading renamed in one document
silently breaks every anchor pointing at it from the others. `docs:links:check`
resolves each one: file targets, same-document anchors, cross-document anchors,
links that leave `docs/`, `README.md` anchors against the manifest sections the
site builds the index from, and the `doc`/`anchor` pairs in
`apps/web/src/content/site.ts`.

It imports the site's own `slugify` from `apps/web/src/markdown/slug.ts` rather
than reimplementing it, so the gate and the published page cannot disagree
about what a heading's anchor is. The rules that follow from that are worth
knowing when a link fails: a document's leading `# H1` is the page title and
gets no anchor of its own, repeated headings are numbered `-1`, `-2` in
document order, and anything inside a fenced code block is not a heading.
The site content is imported too, not scraped, so reordering a field or
rewrapping that file cannot quietly stop it being checked.

Three things it does not see, all of which fail open rather than shut — a
link it cannot parse is a link it does not check: nested brackets in link text
(`[a [b] c](./x.md)`), angle-bracket destinations (`[a](<./x y.md>)`), and
four-space-indented code blocks, which are not masked the way fenced ones are.
None appears in `docs/` today.

Against the way that class of bug usually lands, the check counts what it read
before it reports success: fewer documents than the manifest publishes is a
failure, because every published document is a file under `docs/`. That catches
a scan whose *shape* changed — a glob that stopped matching, a filter that
matched too much. A path that simply moved already fails louder, when the
directory read or the manifest parse throws.

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

`plugin:add`/`plugin:remove` only know how to rewrite a manifest shaped
`{ "plugins": [...] }` — a hand-edited `board.plugins.json` carrying any
other top-level field is refused rather than silently rewritten without it,
since a rewrite that dropped a field nobody named would be a worse surprise
than a refusal that does.

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
