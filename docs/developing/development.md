# Development

How to run the board on your own machine: to read the code, write a theme,
or send a patch. Running a board other people can reach is
[Deployment](../setting-up/deployment/index.md).

**You need:** Node 22 or newer, pnpm 10, and Docker if you want a real
database.

## Getting it running

```sh
git clone https://github.com/meith-dev/meith.git
cd meith
pnpm install
pnpm dev
```

That is a working board on <http://localhost:3000> with **no database at
all**; see [fixture mode](#fixture-mode). Anything that writes, such as
posting, moderation or the installer, needs Postgres:

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
pnpm meith migrate
pnpm dev
```

Open <http://localhost:3000/install> and run the installer, the same one a
real deployment runs. It seals itself when it finishes. The dev compose
file uses a named volume, so the board survives the container being
recreated; `docker compose -f docker/compose.dev.yml down -v` throws the
data away.

> [!NOTE]
> The dev database and the e2e suite both use port 55432, so stop the dev
> Postgres (`docker compose -f docker/compose.dev.yml down`) before running
> `pnpm test:e2e`.

### Fixture mode

With no `DATABASE_URL`, `DATA_SOURCE` falls back to `fixture`:
deterministic in-memory repositories with a sample board in them, a driver
behind the same interfaces as Postgres rather than a mock layer. Three
things depend on it:

- **A fresh checkout runs.** `pnpm install && pnpm dev` needs nothing else.
- **The production build needs no database.** `next build` prerenders, and
  a build that opened a connection would fail wherever the build runs
  before the database is reachable. CI and the Docker image both build in
  fixture mode.
- **The test suite is fast**, because most of it never touches a socket.

Fixture mode does not fake a write. It has no installer, no presence store
and no statistics store, and each surface that needs one says so.

## The workspace

A pnpm workspace: applications in `apps/`, everything else in `packages/`,
`themes/` and `plugins/`.

| Directory | Package | What it is |
|---|---|---|
| `apps/community` | `@meith/web` | The board itself, and the in-repo dev target. `pnpm dev`, on port 3000. |
| `apps/web` | `@meith/site` | meith.dev, the landing page and these documents. `pnpm site:dev`, on port 3100. |
| `apps/worker` | `@meith/worker` | The background tick, as a long-running process. |
| `apps/cli` | `@meith/cli` | The operator CLI. `pnpm meith …`. |
| `boards/stock` | `@meith/board-stock` | A second, create-meith-shaped board: the workspace `docker/Dockerfile` builds the official image from. See [Architecture](./architecture.md#the-stock-board). |
| `packages/*` | `@meith/*` | The domain: accounts, forums, posts, authorization, search, drivers, and the rest. |
| `themes/*` | `@meith/theme-*` | The default theme and four alternates: midnight, phasebook, raidframe, clubhouse. |
| `plugins/*` | `@meith/plugin-*` | Dues (paid membership through Stripe), calendar (shared events linked to threads) and the reference plugin. Outbound webhooks are a core feature; see [Webhooks](../operating/webhooks.md). |
| `examples/*` | none | Reference code to copy, not installed: `hello-plugin` and `iris-theme`. See [`examples/README.md`](https://github.com/meith-dev/meith/tree/main/examples). |

> [!TIP]
> The two directory names are easy to swap: `apps/community` is the board
> (package `@meith/web`), while `apps/web` is the marketing site (package
> `@meith/site`).

Every `@meith/*` import resolves through tsconfig path aliases straight to
`src/index.ts`, with no build step between packages; that is why
`pnpm workspace:check` exists, see
[the checks that fail on purpose](#the-checks-that-fail-on-purpose).

`docker/` is the whole deployment interface: the compose files, the
Dockerfiles, the entrypoint and the healthcheck. The compose files read
their `.env` from beside them, which is why the deploy guides say
`cd meith/docker`. The repository root is a registry: every entry is
listed in `scripts/root-check.mjs` with the reason it must live there, and
`pnpm root:check` fails on an unregistered root file.

How the packages relate, the layers and what may import what, is
[Architecture](./architecture.md).

## Consuming the board from a workspace

`packages/create-meith` scaffolds a board whose `package.json` depends on
`@meith/web` and `@meith/cli` and whose scripts call `forum-web` and
`meith`: a board outside this monorepo, holding only `meith.config.ts`,
`board.plugins.json`, `meith.plugins.ts` and `package.json`. This section
is for anyone changing `apps/community`, `apps/cli` or the scaffold.

**A Next.js app is not consumable as a bare dependency.** `next
dev|build|start` need the app's own directory as the project root, and the
[board-config seam](./architecture.md#the-board-config-seam),
`@board/config` / `@board/plugins`, is a pair of tsconfig path aliases that
here point at `apps/community`'s own files. Neither survives `npm
install`ing `@meith/web` elsewhere. So `forum-web`
(`apps/community/bin/forum-web.mjs`, `@meith/web`'s bin) and `meith`
(`apps/cli/bin/meith.mjs`, `@meith/cli`'s bin) **materialize** the app on
every invocation:

1. Copy the package's own sources into `.meith/app/` (`.meith/cli/` for the
   CLI) inside the invoking workspace: gitignored, rebuilt every run, never
   a merge target. `public/` travels with them, so `/sw.js` and the
   placeholder assets are served from the materialized app too.
2. Write a fresh `tsconfig.json` there whose `paths` point `@board/config`
   and `@board/plugins` at *that workspace's own* `meith.config.ts` /
   `meith.plugins.ts`. A tsconfig path alias may name a target outside the
   package; a Node subpath import may not, which is why the seam is an
   alias.
3. Run `next dev|build|start` (`forum-web`) or `tsx` against the
   materialized entry point (`meith`) with that directory as the working
   root.

`.meith/app/` sits exactly two directories below the workspace root
because `next.config.mjs` computes its workspace root as two directories
up from itself, for `.env` loading, `outputFileTracingRoot` and
`turbopack.root`.

**`forum-web build` stages `.next/static` and `public/` into the
standalone tree** after `next build`. `next.config.mjs` sets
`output: 'standalone'` everywhere except Vercel, and Next's standalone
output excludes both directories, so they are copied in beside the traced
`server.js`. `forum-web start` only execs that staged tree. The official
image (`docker/Dockerfile`) copies both into its runtime stage straight
from the build stage.

**`outputFileTracingIncludes` carries one workaround.** Next's output
tracer follows only the CJS half of `@swc/helpers` and misses the `esm/`
variant its own require-hook resolves at runtime; without the glob,
self-hosted boards fail at request time. The glob names the pnpm store
path, version and all, because `next.config.mjs` is read from places where
`@swc/helpers` does not resolve; `scripts/workspace-check.mjs` fails any
tree where the literal disagrees with an `@swc/helpers` pin. The
unversioned glob beside it covers hoisted installs. Turbopack applies the
include itself and skips `collectBuildTraces`, the only place `next/dist`
reads the option, so do not conclude from that code that the glob is dead:
measured on this app's builds it lands `esm/` entries in every route's
`.nft.json`.

**This assumes a hoisted `node_modules`**: npm, yarn classic, or pnpm with
`node-linker=hoisted` (`create-meith`'s scaffold uses npm). The
materialized app imports every `@meith/*` package by bare specifier,
resolved by walking up from `.meith/app/`, which only reaches a dependency
hoisted to the workspace root. For the same reason
`apps/community/next.config.mjs`'s `transpilePackages` names every
`@meith/*` package the app's dependency graph reaches: in a consuming
workspace they arrive as `.ts` files inside `node_modules` and need source
compilation. `@meith/web` names itself because an external board's
`meith.config.ts` imports the `@meith/web/config` subpath.
`scripts/workspace-check.mjs` holds the list in step with the graph: every
reachable `@meith/*` package must appear in `transpilePackages` or
`serverExternalPackages`, and a name nothing reaches any more fails too.

**Fixture mode covers `forum-web dev` and `forum-web build`, not
`forum-web start`.** A production process refuses `QUEUE_DRIVER=memory`,
fixture mode's only queue driver (`packages/core/src/env.ts`), because
queued work would be lost on every cold start. Running the built server
needs `DATA_SOURCE=postgres` and the same secrets a deployed board needs.

**The CLI materializes for its own reason:** `apps/cli/src/index.ts`
imports `@board/plugins` dynamically, so the `meith` bin must resolve the
seam at run time against whichever workspace invoked it; the image's
bundled CLI bakes its board in at build time. **The worker is not part of
this**: `apps/worker` imports no board config, and the scaffold does not
depend on it.

Four smoke scripts prove all of this against real packed tarballs; nothing
else in `pnpm verify` builds a board from outside this repository. A fifth,
`pnpm published:board:smoke`, runs only at release time against the real
registry ([Releasing](./release.md)).

- **`pnpm board:workspace:smoke`** (`scripts/board-workspace-smoke.mts`,
  CI's `board-workspace` job) packs `@meith/web`'s dependency closure with
  `pnpm pack`, scaffolds a board with `create-meith`, installs it with
  overrides pointing at the tarballs, runs `forum-web build`, applies
  migrations, boots the standalone server against a disposable Postgres,
  and fetches `/`, a real `/_next/static/*` asset and `/sw.js`. It also
  fails on raw message keys in the rendered page (a config that forgot
  `messages: defaultMessages`) or a stylesheet lacking rules for classes
  only `@meith/ui` and the default theme produce (a board Tailwind never
  scanned). It runs twice: at `.meith/app`, the self-host shape, and with
  `--at-root`, the Vercel shape.
- **`pnpm extension:workspace:smoke`** (`scripts/extension-workspace-smoke.mts`,
  CI's `extension-workspace` job) scaffolds a plugin and a theme with
  `create-meith --plugin`/`--theme`, packs them the way `npm publish`
  would, tests and typechecks both against the packed kits rather than
  workspace aliases, then installs both into a scaffolded board and runs
  `forum-web build`. A kit whose `files` allowlist rotted, or a scaffold
  that only compiles against `workspace:*`, fails here.
- **`pnpm board:deploy-kit:smoke`** (`scripts/board-deploy-kit-smoke.mts`,
  CI's `board-deploy-kit` job) builds a scaffolded board's own
  `Dockerfile.prebuilt`, unmodified, against a local stand-in for
  `ghcr.io/meith-dev/meith-base` built from the packed tarballs, then
  boots the image against a disposable Postgres and checks it renders,
  once bare and once with `@meith/plugin-reference` added.
- **`pnpm board:eject:smoke`** (`scripts/board-eject-smoke.mts`, CI's
  `board-eject` job) seeds a thread, runs `meith board:eject` against this
  checkout standing in for a running stock image, builds the ejected
  board's `Dockerfile.prebuilt` with the same stand-in base image, and
  boots it against the **same** database, checking the seeded thread still
  renders.

### Building where Vercel looks

`forum-web build --at-root` materializes into the workspace root itself
instead of `.meith/app`, so `next build` writes to `<root>/.next`, the one
shape Vercel's Next.js preset can read. Three constraints rule out every
other arrangement: the builder reads `.next` under the project root and
that location is not configurable for Next.js; the Root Directory cannot
be `.meith/app`, because Vercel resolves it against the checkout before
anything has materialized; and `.next` cannot be moved after the build,
because `required-server-files.json` records the paths it was built at.

So the app moves, not the output. Every path `forum-web` writes is computed
from the materialization directory. Three things that used to rely on the
depth are told the answer instead:

- **`FORUM_WORKSPACE_ROOT` is always passed on** by `forum-web`, defaulting
  to the invoking workspace's own root. At depth zero it stops the copied
  `next.config.mjs` resolving a workspace root two directories *above* the
  board.
- **The `outputFileTracingIncludes` glob prefix** becomes `.` rather than
  the empty string, which would read as an absolute path and match
  nothing.
- **`globals.css`'s Tailwind `@source` roots are rebased on every
  materialization**, keeping each root only if it exists. Here all four
  (`themes/`, `plugins/`, `examples/`, `packages/ui/src`) exist; beside a
  scaffolded board none do, and `node_modules/@meith` is substituted.
  Tailwind treats a scan root that resolves to nothing as no error: it
  builds green and emits no utilities, which is how scaffolded boards once
  shipped unstyled.

**Depth zero puts framework-owned names beside the board's own files**, so
ownership is decided per file. `--at-root` treats a file as its own when
the record in `.meith/materialized.json` says it wrote it before, or when
what is on disk is byte-for-byte what it would write anyway; the second
rule is what makes a fresh clone, which has no record, deployable.
Everything else is the board's: never removed, never overwritten, and a
collision stops the build naming every file involved. `tsconfig.json` and
`next-env.d.ts` are generated rather than copied, so they are replaced
without asking. Files the record names that this run will not write are
removed, and only those. One narrow hole stays open: a board file
byte-identical to a shipped one is indistinguishable from a materialized
copy.

**`app/` and `src/` are the framework's alone.** A route dropped into
`app/` is preserved but gitignored by the scaffold, so it works locally
and vanishes from a deploy built out of the checkout; `forum-web` warns at
materialization time, naming every foreign file it finds there. A board
extends the forum through plugins and themes. A board **can** own files
under `public/` (`ads.txt`, `.well-known/`, domain verification): the
Vercel target's `.gitignore` lists the framework's `public/` files by name
rather than ignoring the directory. `scripts/workspace-check.mjs` fails if
that list and `forum-web`'s own entries disagree.

**Vercel detects Next.js by reading the root `package.json`**, so the
scaffold declares `next`, and only `next`, at the version `@meith/web`
builds with; `react` and `react-dom` arrive by hoisting.
`scripts/workspace-check.mjs` holds every manifest that pins `next`,
`react` or `react-dom` (and `create-meith`'s `NEXT_VERSION`) to
`@meith/web`'s pins.

**The Vercel target turns the mode on; nothing else does.** `scaffold()`'s
`target: 'vercel'` tree carries the flag in `vercel.json`'s `buildCommand`
(`meith migrate && forum-web build --at-root`) and in its own scripts, so a
board built locally and on the platform materialize to the same place. The
self-host target is untouched. `pnpm templates:gen:check` ties the
generated `templates/self-host/` and `templates/vercel/` trees back to
`scaffold()`.

## The commands

| Command | What it does |
|---|---|
| `pnpm dev` | The board, on port 3000. |
| `pnpm site:dev` | meith.dev, on port 3100. |
| `pnpm build`, `pnpm site:build` | The production builds of the board and of meith.dev; CI's `build` job runs both in fixture mode. |
| `pnpm meith <command>` | The operator CLI against your `.env`. `--help` lists everything. |
| `pnpm test` | The whole unit suite. `pnpm test:watch` while you work. |
| `pnpm typecheck` | The workspace. `typecheck:app` and `typecheck:site` cover the two Next projects. |
| `pnpm lint` | Biome: formatting, lint rules and import order, in one pass. `pnpm format` writes the fixes. |
| `pnpm verify` | **The full static gate.** Run it before opening a pull request; see below. |
| `pnpm test:e2e` | Playwright: the no-JavaScript paths, the staff panels, and the accessibility checks. It builds the board and runs the standalone output against its own databases. `pnpm test:e2e:build` is the build on its own. |
| `pnpm i18n:baseline` | Rewrites `scripts/i18n-baseline.json`, the per-file allowance of untranslated strings `i18n:check` holds the tree to; run it once a file is extracted, since the baseline only ever goes down. |
| `pnpm perf` | The load run (`packages/testkit/src/load/run.ts`) whose results `pnpm perf:docs` turns into `docs/reference/performance.md`. |
| `pnpm templates:sync` | Mirrors `templates/<target>/` into the deploy template repositories; the release workflow runs it, and `templates:sync:check` only compares. See [Releasing](./release.md#deploy-template-repositories). |
| `pnpm site:shots` | Re-photographs meith.dev's screenshots against the demo board. Never on CI; see [the site's screenshots](#the-sites-screenshots). |

`pnpm verify` runs, in order: the workspace check and the verify/CI parity
check, the root and release checks, the guards and their probes, the
message-catalog check, the slot checks, the generated-document and
documentation checks (`theme:docs`, `plugin:docs`, `board:gen`,
`hooks:wired`, `regions:wired`, `api:docs`, `perf:docs`, `docs:index`,
`docs:links`, `site:docs`, `marketplace:gen`, `board-installer:gen`,
`templates:gen`, `extension:gen`), lint, dependency-cruiser, all three
typecheck projects, and the full test suite.

**`pnpm verify` and CI's `static` job hold to each other.** `pnpm
ci:parity:check` reads the `verify` script and the `static` job out of
`.github/workflows/ci.yml` and fails, naming them, on any gate chained in
one and missing from the other; it is itself a gate in both. The one
exception is written out in `scripts/ci-parity.mjs`: `verify` ends on
`pnpm test`, while `static` runs the same suite as `pnpm test:coverage`,
and the `migrations` job runs it again against real Postgres. `static`
also packs every publishable tarball against its manifest, runs the Redis
cache-driver contract and applies the coverage thresholds. Run
`pnpm test:coverage` yourself before a pull request that moves what is
covered.

CI's other jobs: `build` runs `pnpm build` and `pnpm site:build`; `image`
builds the standalone board image and boots it in every role; `site-image`
builds `docker/Dockerfile.site` and checks meith.dev serves its landing
page and doc routes; `board-workspace`, `extension-workspace`,
`board-deploy-kit` and `board-eject` run the four smoke scripts above;
`compose` brings up both self-hosting compose files from `docker/`; `e2e`
drives a browser across four shards; `migrations` runs the suite against
real Postgres and checks for schema drift; `backup` round-trips a backup
and restore on a live database; and `templates-in-sync` runs
`templates:sync:check`.

## No inline comments

`AGENTS.md` carries the rule: an explanation belongs in the document under
`docs/` that covers the behaviour, changed in the same commit, never in the
code. Nothing checks a comment against the code beside it; a paragraph in
`docs/` is held by the links gate, the index gate and the generated
references.

The rule covers `/** */` as much as `//`. Four kinds of comment are the
only exceptions:

- **`biome-ignore` suppressions**, which the linter reads and which must
  carry a reason.
- **`@ts-expect-error`**, which the compiler reads.
- **Type annotations the compiler reads**, `@type`, `@satisfies` and
  `/// <reference>`, mostly in `.mjs` files.
- **The prose in the six files a generated reference is built from**:
  `packages/theme-kit/src/{slots,api,view-models}.ts`, published by
  `pnpm theme:docs` as [the theme slot reference](../reference/theme-slots.md),
  and `packages/plugin-kit/src/{hooks,payloads,regions}.ts`, published by
  `pnpm plugin:docs` as [the plugin hook reference](../reference/plugin-hooks.md).
  There the comment *is* the published document.

### How it is enforced

Three layers, none of them CI. All three scan with
`scripts/comment-scan.mjs` and compare against `HEAD` rather than a
checked-in allowlist, so they ignore existing comments and refuse new ones.

- **`pnpm comments:check`** lists every comment your change adds. Run it
  before you finish.
- **The git `pre-commit` hook** (`.githooks/pre-commit`) runs the same
  check over the staged tree and refuses the commit; `pnpm install` arms
  it via `core.hooksPath`. `git commit --no-verify` is the deliberate way
  past it.
- **A `PostToolUse` hook** (`.claude/hooks/no-inline-comments.mjs`) rejects
  a Claude Code file write on the spot. It covers one tool only.

Nothing in `pnpm verify` or CI checks for comments: enforcement sits where
the writing and committing happen.

## Formatting and lint

One tool does both: [Biome](https://biomejs.dev/), configured in
`biome.json` at the root. `pnpm lint` checks formatting, the lint rules and
import order; `pnpm format` writes the fixes. `pnpm verify` runs the check,
so a badly formatted file fails CI.

The formatter is not configurable per file: single quotes, no semicolons,
two-space indent, 100 columns, and the version pinned exactly in
`package.json`. It covers TypeScript, JSX, JSON and CSS. `biome.json`
excludes what is generated or vendored: `docs/reference/openapi.json` and
the `docs/reference/perf-*.json` files, the `templates/` trees, `apps/*/public`,
`pnpm-lock.yaml`, and every `node_modules`, `dist`, `drizzle` and `.next*`
directory. Markdown, YAML and SQL have no formatter: `docs/`, the workflows
and the migrations are written by hand.

Three rules carry an invariant rather than a preference:

- **`style/noProcessEnv`.** `process.env` is read in
  `packages/core/src/env.ts` and nowhere else, so every variable is
  validated once at boot. Exempt in `biome.json`'s override: `scripts/`,
  `apps/cli`, `apps/worker`, `apps/community/bin`, `packages/create-meith`,
  `packages/testkit`, config files (`*.config.{ts,mts,mjs,js,cjs}`) and
  tests. `pnpm guards` enforces the same rule textually, catching reads in
  files Biome does not parse.
- **`scripts/no-group-ids.grit`.** A Biome plugin that fails on any read of
  `.groupIds` or `.primaryGroupId`. Group IDs must not leak outside
  `@meith/authorization`; ask the Authorizer `can(actor, action, target)`
  instead. The modules that legitimately carry a group id as data are
  named by path in the plugin itself, because a plugin diagnostic cannot
  be suppressed on one line.
- **`suspicious/noConsole`.** The board logs through `logger()`. Processes
  that *are* their output are exempt by the same override as
  `noProcessEnv`: the CLI, the worker, the scripts, the bins, `create-meith`
  and the testkit. The e2e harness under `e2e/` is not in that override;
  the few places it prints carry a per-line `biome-ignore`.

Everything else is Biome's recommended set, with two rules off in
`biome.json`: `noDangerouslySetInnerHtml` would fire on every rendered post
body, and that safety argument is settled in `@meith/markdown`, the only
place rendered HTML comes from; `noImgElement` would ask for `next/image`
on a board that runs without an image optimiser.

A suppression is always a `biome-ignore` with a reason, never a blanket
disable:

```ts
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
```

> [!IMPORTANT]
> **Do not run `pnpm format` in a feature change.** A whole-tree rewrite
> buries what you were actually changing. Format the files you touched,
> or let your editor do it on save.

## The database in tests

`pnpm test` needs no database. Repository tests, migrations and anything
asserting on real SQL run against PGlite, a real Postgres compiled to
WebAssembly, booted in-process per suite with the checked-in migration SQL
applied.

The `*.pg.test.ts` files need a real Postgres *server*, for behaviour
PGlite cannot reproduce. `packages/db/src/client.pg.test.ts` exercises the
client driver PGlite bypasses; `packages/db/src/migrate.pg.test.ts` and
`packages/db/src/install-repo.pg.test.ts` need two connections contending
for a session-level lock; `packages/testkit/src/postgres-queue-pooled.pg.test.ts`
needs each connection to own its own backend, because a wire server in front
of one PGlite funnels every client into a single backend whose one unnamed
prepared statement the connections overwrite for each other; and
`packages/demo/src/reset.pg.test.ts` runs the demo reset, which drops and
recreates the schema, against a real engine.

They all skip unless `TEST_DATABASE_URL` is set:

```sh
docker compose -f docker/compose.dev.yml up -d
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/community_test pnpm test
```

CI's `migrations` job sets it.

## Coverage

`pnpm test:coverage` runs the unit and integration suite with V8 coverage
and writes the HTML report to `coverage/index.html`. CI's `static` job runs
that command as its only pass over the suite: `--coverage` decides what is
measured, never what is collected, so it is `pnpm test` plus the
thresholds.

The global thresholds prevent repository-wide regressions, and separate
floors for the worker, polls, attachments, and UI packages keep well-tested
packages from hiding a decline in those areas. Thresholds are a ratchet:
raise them when the measured baseline improves, and do not lower them
without documenting the reason in the same change. `packages/drafts` is
interfaces only, erased at runtime and checked by `index.type-test.ts`, and
is due a floor when it grows runtime behavior.

## UI primitives and destructive actions

App components share the primitives in `@meith/ui` rather than re-declaring
the same class strings. A prose link, underlined and not a button, is a
`TextLink` (`@meith/ui`), whose `textLinkVariants` carries the one
underline recipe; a link-styled `<button>` reuses `textLinkVariants(...)`.
Use these instead of writing `underline decoration-border …` again.

A **destructive action confirms itself, fallback-first.** The server action
calls `requireConfirmation(form, message)` (`server/confirm.ts`): when the
submission carries no `confirmed` field it returns the message and a
snapshot of the submitted fields as `state.confirm` and does nothing else.
The client `ConfirmDialog` renders that state two ways from one markup: a
`@meith/ui/dialog` `AlertDialog` when scripting is on, and, under
`<noscript>`, a plain interstitial that re-submits the snapshot with
`confirmed=1`. The interstitial is the real path, so the no-JS specs step
through the confirm page (empty trash and delete-forever in
`undo-no-js.spec.ts`, post and thread deletion in
`moderation-no-js.spec.ts`, token revocation on the enhanced path in
`admin-panel-live.spec.ts`). It applies to every destructive admin action
with no other guard: API token revocation, attachment / announcement /
prefix / word-filter / smiley / captcha-question / directive deletion,
navigation-link deletion, and ban-filter removal. Actions already guarded
by the preview-and-undo pattern (`admin-undo.tsx`) or a fresh-password
re-check (group and promotion-rule deletion) keep those guards. Three
one-click removals stay un-gated because what they destroy can be put
straight back: the favicon and logo, which are re-uploaded, and a badge
definition.

A **notice is a toast, with the banner as its fallback.** Actions still
redirect carrying the notice in the query string; `BoardNotice` renders the
`@meith/ui/toast` `Toast` island, dismissible, auto-dismissing and
`role="status"`, and keeps the theme's `Notice` banner under `<noscript>`,
toggled by the same `data-`attribute-and-`<noscript>` pattern the
notification and user menus use. **Tooltips** (`@meith/ui/tooltip`) label
cramped icon controls such as the multiquote toggle; they open on hover and
focus, so the control still needs its own accessible name for touch and
screen readers.

## The browser suite

`pnpm test:e2e` starts everything it needs: a PGlite serving the Postgres
wire protocol, a built server running the standalone output against it, and
a second database and server for `/install`.

The build comes first (`e2e/support/board-build.ts`; `pnpm test:e2e:build`
runs it alone) and needs no database, since every route is dynamic. A cold
build takes about a minute and an unchanged rebuild a few seconds. Both
servers run the same `server.js` from the same `.next-e2e/standalone`
tree, staged with `static` and `public/` the way `forum-web build` stages
them, and differ only in `PORT`, `DATABASE_URL` and `UPLOADS_DIR`. Running
`npx playwright test` directly skips the build and serves whatever was
built last.

There is no CI retry. **A browser test that fails intermittently is a
signal**, usually a real race in the test or the product: read it rather
than retry it. `e2e/support/flaky-notice.ts` stays wired so that a run with
`--retries` prints a warning for a test that failed and then passed.

The `/install` database carries the schema and no rows, the state a real
board is in when someone opens `/install`: migrations run before the board
serves anything, and the installer checks the schema rather than applying
it.

**Most specs run with JavaScript disabled**, two-thirds of the suite,
because the board's claim is that a native `<form>` does the work and the
islands are optional. The JS-on specs are the ones whose subject needs
scripting: accessibility, passkeys, the content security policy, the API,
syndication, the screenshot tours, plus `admin-panel-live.spec.ts`. With
scripting off a form post is a full navigation, so only that spec can see
a panel screen that does not refresh its own cached list.

A spec that needs a member **registers through the form**: the seeded
accounts carry a hash nothing can match. A registration always lands in
the Registered group, so for *staff* two accounts are seeded with a real
password, both named in `e2e/support/config.ts`:

| Account | Group | For |
|---|---|---|
| `admin` | Administrators | The control panel. Bypasses forum permissions. |
| `e2e_moderator` | Super Moderators | Moderation. Deliberately **not** an administrator, so the specs prove the moderator's own path rather than the bypass, and prove the panel is shut to them. |

Use `signUp`, `signInAsModerator` and `enterAdminPanel` from
`e2e/support/session.ts` rather than repeating the forms. `signUp` also
asserts the username fits the board's 30-character maximum: the
registration input silently truncates a longer one, and the sign-in that
follows fails.

The two-factor specs cover both halves of the no-JS contract: every
authenticator-code field renders `OtpField`, a native text input that takes
a six-digit or recovery code with scripting off and upgrades to the
`@meith/ui` `InputOTP` boxes once scripting confirms.
`two-factor-no-js.spec.ts` signs in through the fallback,
`two-factor.spec.ts` through the widget.

**The suite shares one database across every spec, in file order**:
`workers: 1`, `fullyParallel: false`. A spec that changes something every
page shows (an announcement, a board setting, a pinned thread) must put it
back, or a later file fails. It shares the **scheduler** too: a spec that
drives background work through `/api/system/tick` can find a task not yet
due if an earlier spec ticked, so give such a spec its own
`test.setTimeout` longer than the wait it asks for. `DATABASE_POOL_MAX` is
`1` for the suite, so queries made concurrent with `Promise.all` still
serialise on the single connection.

**Passing is not enough; the run also fails on what the board logged.**
`e2e/support/server-errors.ts` reads the server's output and fails the run
on any unhandled server error. A green run once hid fifty-six of them.

The specs are typechecked by `pnpm typecheck`; Playwright transpiles
without checking. **CI shards the suite across four runners**, each with
its own databases and servers; every spec seeds what it needs, so the split
is safe in any order. `.next-e2e` is not cached between CI runs: a
restored build is the stale-cache problem, and a cold build is cheap.

A built server is production, and three harness details follow:

- Password-reset tokens are not readable off the page outside development,
  so `account-security-no-js.spec.ts` reads the token out of the **e-mail**:
  `MAIL_DRIVER=http` points the board at `e2e/support/fake-mail.ts`, and
  `e2e/support/mailbox.ts` reads the inbox back.
- The e2e board does not know its own address: `admin-panel-live.spec.ts`
  asserts the warning about that, and `passkeys.spec.ts` needs to reach
  the board as `localhost`. The one test that needs an address sets it
  through the panel and puts it back.
- Production session cookies are `__Host-` prefixed and `Secure`. Chromium
  sends them over `http://127.0.0.1`, but Playwright's `page.request` will
  not; `signedHeaders()` in `e2e/support/session.ts` attaches the context's
  cookies to those calls. To drop one cookie, prefer `clearCookies({ name })`
  over rebuilding the jar.

**A known pre-existing order dependency.** Run serially in one process,
`admin-tabs-no-js.spec.ts` leaves something behind that makes
`formatting-no-js.spec.ts`'s server-side highlighting and
`formatting.spec.ts`'s attachment rendering fail. CI does not see it, since
those specs land in different shards. It is a separate bug, recorded here
rather than fixed.

## The site's pages

meith.dev makes one argument, *built for communities, owned by them*, once
per audience. The copy is data, not markup: every heading, lede and link
lives in `apps/web/src/content/`, and the pages under `apps/web/app/` only
lay it out.

| Route | Content | What it argues |
|---|---|---|
| `/` | `site.ts` | The broad case: ownership, permanence, independence, open source, predictable cost. It introduces developers and the audience pages and links into them rather than carrying their detail. |
| `/who-its-for` | `segments.ts` | The chooser: one card per audience. |
| `/who-its-for/developers` | `developers.ts` | The technical story: the board as a repository, fixture mode, the typed extension contracts and their counts, the measured performance, self-hosting, open source. Detailed developer copy belongs here, not on the homepage. |
| `/who-its-for/<segment>` | `segments.ts` | One templated page per remaining audience: open source, communities, clubs and associations, and MyBB/phpBB boards. |
| `/about` | `about.ts` | The ethos, as an essay: why the project exists, ownership and permanence, open source, handover, the code-first philosophy, the origin of the name, and the principles. It links into the audience pages rather than repeating them. |

The developer page has its own file because its shape differs from the
template; a new template audience is a new entry in `segments.ts` and
nothing else. Every route also renders an Open Graph card from the same
content (`app/og`, `app/who-its-for/og`, `app/about/og`), and the sitemap and
the header's menu read the audience list. The old `/for/*` routes redirect
permanently in `apps/web/next.config.mjs`.

Numbers the pages quote (slot, hook and endpoint counts, the benchmark
board and its measurements) are read from the generated references at
build time by `apps/web/src/content/facts.ts`, so a figure the code no
longer supports fails the build.

## The site's screenshots

Every image on meith.dev is a screenshot of a real board, taken by
`pnpm site:shots`. They land in `apps/web/public/shots`, and the site
references them by name, so a rename there is a broken image.

It photographs the **demo board**: the twenty forums of `packages/demo`,
all five themes, and the Dues shop. The behaviour specs' fixture is written
to be asserted, not looked at. The demo board needs its own ports, so it
has its own config (`e2e/screenshot-site.config.ts`) rather than a project
in `playwright.config.ts`.

**It does not run on CI**: the shots change whenever the seed's relative
timestamps move, which would put megabytes of visually identical PNGs into
every pull request. Re-take them when the board's appearance changes, and
commit only the images that differ.

Four facts about the demo board decide how the shots are taken, each
asserted in `e2e/screenshot-site.spec.ts`: the demo strip publishes
`admin / admin` and is hidden before each shot; the seed holds a spam
thread in the moderation queue, so shots are taken as `member` rather than
an administrator who can see it; a freshly seeded board has indexed nothing
and counted nothing, so the scheduler is driven until search answers; and
search is rate-limited, so the light-and-dark pair is taken from the stored
`/search/<token>` URL rather than asking the search route twice.

## The checks that fail on purpose

Several gates in `pnpm verify` each check a fact about the repository
that nothing else reads:

| Script | What it catches |
|---|---|
| `workspace:check` | A package directory with sources and no `package.json`, or a manifest the lockfile has not seen. Both pass every other gate and fail `pnpm install --frozen-lockfile`, CI's first step. Also an `@meith/*` package a board installs that `next.config.mjs` does not compile: invisible in here, where the path aliases resolve to source, and red on every board-build job at once. |
| `ci:parity:check` | A gate chained in `pnpm verify` that runs in no step of `ci.yml`'s `static` job, the defect that once let six gates pass for a developer and merge green. See [the commands](#the-commands). |
| `root:check` | A new file at the repository root. Every entry is registered with the reason it must live there. |
| `release:check` | A version written anywhere that disagrees with the release version, or a published package depending on a private one. See [Releasing](./release.md). |
| `guards` | Textual invariants: the things a grep can prove and a type cannot. `guards:probe` proves each guard still fires. |
| `i18n:check` | A message the code names and the catalog does not carry, a message nothing reads any more, a mirrored setting label that has drifted from the catalog, or a view builder that gained a hardcoded English string. See [Languages](../operating/internationalisation.md). |
| `slots:check` | The server/client boundary in theme slots, in both directions. |
| `hooks:wired` | A hook fired by name that the registry does not declare, the typo that would otherwise be a call nothing listens to. It also derives the wired/unwired list that `pnpm plugin:docs` publishes. |
| `regions:wired` | A UI region declared in the registry that no call site in `apps/community` renders, the asymmetry that let `admin.dashboard` sit in the reference while rendering nowhere. It also flags a call site that renders a region the registry does not declare. |
| `theme:docs:check`, `plugin:docs:check`, `api:docs:check`, `perf:docs:check` | A generated reference that has drifted from the code it describes. |
| `board:gen:check` | Either board's `meith.plugins.ts` out of step with its `board.plugins.json`; see [the board plugin manifests](#the-board-plugin-manifests). |
| `marketplace:gen:check`, `board-installer:gen:check`, `templates:gen:check` | A published artifact generated from this repository that has drifted from its source: the marketplace feed meith.dev serves, the one-line board installer, and the `templates/` trees people deploy from. |
| `extension:gen:check` | `create-meith`'s plugin and theme scaffold templates out of step with `examples/hello-plugin` and `examples/iris-theme`, which they are generated from. |
| `docs:index:check`, `site:docs:check` | A document in `docs/` that the index does not link, or that is neither published on the site nor explicitly repository-only. |
| `docs:links:check` | An internal link or anchor under `docs/` that resolves to nothing: a renamed heading, a moved file, or a section that never existed. It also checks the `doc`/`anchor` pairs `apps/web` links back into `docs/`. See [documentation links](#documentation-links). |

One check runs in CI but **not** in `pnpm verify`: `templates:sync:check`
clones the two deploy-template repositories and diffs each against its
generated `templates/<target>/` tree. It needs the network, so it lives in
its own CI job; see
[Releasing](./release.md#deploy-template-repositories).

Three of those gates read the working tree rather than the index.
`root:check` tolerates an unregistered root entry only when git ignores it;
`guards` and `i18n:check` share the walker in `scripts/repo-files.mjs`,
which skips build and tooling output by name: `node_modules`, `dist`,
`coverage`, `.meith`, `.claude` and their kind. A new tool that writes into
the tree belongs in both that list and `.gitignore`.

## Documentation links

The site publishes `docs/` directly, so a heading renamed in one document
breaks every anchor pointing at it. `docs:links:check` resolves every
internal link and anchor: file targets, same-document and cross-document
anchors, `README.md` against the manifest, and the `doc`/`anchor` pairs in
the site's content modules, `apps/web/src/content/site.ts`, `segments.ts`,
`developers.ts` and `about.ts`. It imports the site's own `slugify`, so the
gate and the published page agree on what a heading's anchor is.

When a link fails: a document's leading `# H1` is the page title and gets
no anchor of its own, repeated headings are numbered `-1`, `-2` in document
order, and anything inside a fenced code block is not a heading.

## The board plugin manifests

This repository carries two boards, each with its own `board.plugins.json`
and generated `meith.plugins.ts`: `apps/community`, the in-repo dev
target, and `boards/stock`, the workspace the official image is built
from. `tests/boards-stock.test.ts` requires the two manifests to stay
identical, so installing a plugin in this checkout means adding the
dependency to both boards; see
[the plugin API](./plugins.md#writing-a-plugin).

`scripts/boards.json` is the one place the list of boards is written down;
both the generator (`pnpm board:gen`) and the CLI's
`plugin:add`/`plugin:remove` read it. Those commands only rewrite a
manifest shaped `{ "plugins": [...] }`; one carrying any other top-level
field is refused. `MEITH_BOARD_PLUGINS_ROOT` redirects the whole read/write
root; only the tests set it, so a real add-and-remove round trip never
edits a fixture tree's boards by accident.

## The generated documents

Five documents are written from the code they describe and must not be
edited by hand:

```sh
pnpm theme:docs      # docs/reference/theme-slots.md,  from the slot registry
pnpm plugin:docs     # docs/reference/plugin-hooks.md, from the hook registry
pnpm api:docs        # docs/reference/openapi.json,    from the route registry
                     # docs/reference/api.md,     from that OpenAPI document
pnpm perf:docs       # docs/reference/performance.md,  from the last load run
```

`pnpm verify` fails when one is stale.

## The documentation itself

`docs/*.md` is the one editable copy. The site at
[meith.dev/docs](https://www.meith.dev/docs) renders those same files at
build time and holds no copy of them.

Adding a document means putting it in `docs/`, naming it in
`apps/web/content/docs.manifest.json`, under `documents` to publish it or
`internal` to keep it repository-only, linking it from
[`docs/README.md`](../README.md), and running:

```sh
pnpm site:docs      # rewrites the documentation table in the root README and checks the set
```

Both index checks fail on a file that is in neither list.

## Before opening a pull request

1. `pnpm verify` passes.
2. New behaviour has a test that fails without it.
3. You have read [Next.js conventions](./nextjs-conventions.md), the
   decisions that would otherwise be re-litigated in every review.

## Where to read next

| You want | Read |
|---|---|
| How the system fits together | [Architecture](./architecture.md) |
| The conventions this codebase holds to | [Next.js conventions](./nextjs-conventions.md) |
| To write a theme | [The theme API](./themes.md) |
| To write a plugin | [The plugin API](./plugins.md) |
