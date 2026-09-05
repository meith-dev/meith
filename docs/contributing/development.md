# Development

How to run the board on your own machine — to read the code, write a theme,
or send a patch. This is not how you run a board other people can reach:
that is [Deployment](../getting-started/deployment/index.md).

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
pnpm meith migrate
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
| `apps/cli` | `@meith/cli` | The operator CLI. `pnpm meith …`. |
| `boards/stock` | `@meith/board-stock` | A second, create-meith-shaped board — the workspace `docker/Dockerfile` builds the official image from. See [Architecture](../reference/architecture.md#the-stock-board). |
| `packages/*` | `@meith/*` | The domain: accounts, forums, posts, authorization, search, drivers, and the rest. |
| `themes/*` | `@meith/theme-*` | The default theme and four alternates: midnight, phasebook, raidframe, clubhouse. |
| `plugins/*` | `@meith/plugin-*` | Dues (paid membership through Stripe), calendar (shared events linked to threads) and the reference plugin. Outbound webhooks are a core feature — see [Webhooks](../guides/operations/webhooks.md). |
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
[Architecture](../reference/architecture.md).

## Consuming the board from a workspace

`packages/create-meith` scaffolds a board whose `package.json` depends on
`@meith/web` and `@meith/cli` and whose scripts call `forum-web` and
`meith` — a board outside this monorepo, in a directory that holds only its
own files: `meith.config.ts`, `board.plugins.json`, `meith.plugins.ts` and
`package.json`. This section is how that actually runs, for anyone changing
`apps/community`, `apps/cli` or the scaffold.

**A Next.js app is not consumable as a bare dependency.** `next
dev|build|start` need to run with the app's own directory as the project
root, and the
[board-config seam](../reference/architecture.md#the-board-config-seam) —
`@board/config` / `@board/plugins` — is a pair of tsconfig path aliases
that, inside this monorepo, point at `apps/community`'s own files. Neither
survives `npm install`ing `@meith/web` into somebody else's workspace. So
`forum-web` (`apps/community/bin/forum-web.mjs`, `@meith/web`'s bin) and
`meith` (`apps/cli/bin/meith.mjs`, `@meith/cli`'s bin) **materialize** the
app on every invocation:

1. Copy the package's own sources into `.meith/app/` (`.meith/cli/` for the
   CLI) inside the invoking workspace — gitignored, rebuilt every run,
   never a merge target. `public/` travels with them, so `/sw.js` and the
   placeholder assets are served from the materialized app too.
2. Write a fresh `tsconfig.json` there whose `paths` point `@board/config`
   and `@board/plugins` at *that workspace's own* `meith.config.ts` /
   `meith.plugins.ts`. A tsconfig path alias may name a target outside the
   package — a Node subpath import may not — which is why the seam is an
   alias in the first place.
3. Run `next dev|build|start` (`forum-web`) or `tsx` against the
   materialized entry point (`meith`) with that directory as the working
   root.

`.meith/app/` sits exactly two directories below the workspace root on
purpose: `next.config.mjs` computes its own workspace root as two
directories up from itself (for `.env` loading, `outputFileTracingRoot`
and `turbopack.root`), and materializing at that depth keeps the
computation correct whether the file runs in place here or copied into
somebody else's workspace.

**`forum-web build` stages `.next/static` and `public/` into the
standalone tree** after `next build` finishes. `next.config.mjs` sets
`output: 'standalone'` everywhere the board has to serve itself — that is
everywhere except Vercel, which packages the build into its own functions —
and Next's standalone output deliberately excludes both directories, so
they are copied in beside the traced `server.js`. `forum-web start` only
execs that already-staged tree. The official image (`docker/Dockerfile`)
copies `.next/static` and `public/` into its slimmer runtime stage itself,
straight from the build stage.

**`outputFileTracingIncludes` carries one workaround.** Next's output
tracer follows only the CJS half of `@swc/helpers` and misses the `esm/`
variant its own require-hook resolves at runtime, so without the glob the
standalone tree ships half a package and self-hosted boards fail at request
time. The glob names the pnpm store path — version and all — because
`next.config.mjs` is read from places where `@swc/helpers` does not resolve
at all, so there is nothing to derive the version from;
`scripts/workspace-check.mjs` fails any tree where the literal disagrees
with an `@swc/helpers` pin, so a bump cannot leave the glob matching
nothing. The unversioned glob beside it covers hoisted installs. The
include is applied by Turbopack itself — `collectBuildTraces`, the only
place `next/dist` reads the option, is skipped under Turbopack, so do not
conclude from that code that the glob is dead; measured on this app's own
builds it lands `esm/` entries in every route's `.nft.json`.

**This assumes a hoisted `node_modules`** — npm, yarn classic, or pnpm with
`node-linker=hoisted` (`create-meith`'s scaffold uses npm). The
materialized app imports every `@meith/*` package by bare specifier,
resolved by walking up from `.meith/app/` — which only reaches a dependency
hoisted to the workspace root. That is also why
`apps/community/next.config.mjs`'s `transpilePackages` names every
`@meith/*` package the app's dependency graph reaches: in here the path
aliases resolve them to source, but in a consuming workspace they arrive as
`.ts` files inside `node_modules` and need the same source-compilation
treatment or the build fails. (`@meith/web` names itself for the same
reason — an external board's `meith.config.ts` imports the
`@meith/web/config` subpath.) That list is a hand-written mirror of a
dependency graph, so `scripts/workspace-check.mjs` holds the two in step:
every reachable `@meith/*` package must appear in `transpilePackages` or
`serverExternalPackages`, and a name nothing reaches any more fails too.

**Fixture mode covers `forum-web dev` and `forum-web build`, not
`forum-web start`.** A production process refuses `QUEUE_DRIVER=memory` —
fixture mode's only queue driver — on purpose
(`packages/core/src/env.ts`): queued work would be lost on every cold
start. So a fresh scaffold builds and browses with nothing configured, and
running the built server for real needs `DATA_SOURCE=postgres` and the same
secrets a deployed board needs.

**The CLI materializes for its own reason:** `apps/cli/src/index.ts`
imports `@board/plugins` dynamically, so the `meith` bin must resolve the
seam at run time against whichever workspace invoked it — unlike the
image's bundled CLI, which bakes its board in at build time. **The worker
is not part of this**: `apps/worker` imports no board config, and the
scaffold does not depend on it today.

Two smoke scripts prove all of this against real packed tarballs, since
nothing else in `pnpm verify` builds a board from outside this repository:

- **`pnpm board:workspace:smoke`** (`scripts/board-workspace-smoke.mts`,
  CI's `board-workspace` job) packs `@meith/web`'s dependency closure with
  `pnpm pack`, scaffolds a board with `create-meith`, installs it with
  overrides pointing at the tarballs, runs `forum-web build`, applies
  migrations, boots the standalone server against a disposable Postgres,
  and fetches `/`, a real `/_next/static/*` asset and `/sw.js`. Because
  answering 200 is not the same as working, it also fails if the rendered
  page contains raw message keys (a board whose config forgot
  `messages: defaultMessages`) or if the stylesheet lacks rules for classes
  only `@meith/ui` and the default theme produce (a board Tailwind never
  scanned). The whole run happens twice — once at `.meith/app`, the
  self-host shape, and once with `--at-root`, the Vercel shape — because
  every board bug found so far shipped through whichever depth the smoke
  did not cover.
- **`pnpm extension:workspace:smoke`** (`scripts/extension-workspace-smoke.mts`,
  CI's `extension-workspace` job) is the same proof for extension authors:
  it scaffolds a plugin and a theme with `create-meith --plugin`/`--theme`,
  packs them the way `npm publish` would, tests and typechecks both against
  the packed kits rather than workspace aliases, then installs both into a
  scaffolded board and runs `forum-web build`. A kit whose `files`
  allowlist rotted, or a scaffold that only compiles against
  `workspace:*`, fails here before an author finds out.

### Building where Vercel looks

`forum-web build --at-root` materializes into the workspace root itself
instead of `.meith/app`, so `next build` writes to `<root>/.next`. That is
the one shape Vercel's Next.js preset can read, and the only reason the
mode exists. Three constraints, none of them ours to change, close off
every other arrangement: the builder reads `.next` under the project root
and that location is not configurable for Next.js; the Root Directory
cannot be `.meith/app`, because Vercel resolves it against the checkout
before anything has materialized; and `.next` cannot be moved after the
build, because `required-server-files.json` records the paths it was built
at and the breakage would arrive at request time.

So the app moves, not the output. Every path `forum-web` writes is computed
from the materialization directory, so the seam works identically at either
depth; three things that used to rely on the depth are told the answer
instead:

- **`FORUM_WORKSPACE_ROOT` is always passed on** by `forum-web`, defaulting
  to the invoking workspace's own root — at depth zero it is what stops the
  copied `next.config.mjs` resolving a workspace root two directories
  *above* the board.
- **The `outputFileTracingIncludes` glob prefix** becomes `.` rather than
  the empty string, which would read as an absolute path and silently match
  nothing.
- **`globals.css`'s Tailwind `@source` roots are rebased on every
  materialization**, keeping each root only if it exists. Inside this
  repository all four (`themes/`, `plugins/`, `examples/`,
  `packages/ui/src`) exist; beside a scaffolded board none do — that code
  lives under `node_modules/@meith`, which is substituted instead. The
  rebase matters because Tailwind treats a scan root that resolves to
  nothing as no error at all: it builds green and emits no utilities, which
  is how scaffolded boards once shipped unstyled.

**Depth zero puts framework-owned names beside the board's own files**, so
ownership is decided per file rather than per directory. `--at-root` treats
a file as its own when the record in `.meith/materialized.json` says it
wrote it before, or when what is on disk is byte-for-byte what it would
write anyway (which is what makes a fresh checkout deployable — a clone has
no record). Everything else is the board's: never removed, never
overwritten, and a collision stops the build naming every file involved.
`tsconfig.json` and `next-env.d.ts` are generated rather than copied, so
they are replaced without asking. Files the record names that this run will
not write — the framework stopped shipping them — are removed, and only
those. One narrow hole is open deliberately: a board file byte-identical to
a shipped one is indistinguishable from a materialized copy, and closing
that would mean giving up the fresh-checkout case.

**`app/` and `src/` are the framework's alone.** A route dropped into
`app/` is preserved per the rules above but gitignored by the scaffold, so
it works locally and silently vanishes from a deploy built out of the
checkout — `forum-web` warns at materialization time, naming every foreign
file it finds there. A board extends the forum through plugins and themes.
A board **can** own files under `public/` (`ads.txt`, `.well-known/`,
domain verification): the Vercel target's `.gitignore` lists the
framework's `public/` files by name rather than ignoring the directory, so
a board's own additions are tracked normally.
`scripts/workspace-check.mjs` fails if that list and `forum-web`'s own
entries ever disagree.

**Vercel detects Next.js by reading the root `package.json`**, not by
resolving the package, so the scaffold declares `next` — and only `next`,
at the version `@meith/web` builds with; `react` and `react-dom` still
arrive by hoisting. `scripts/workspace-check.mjs` holds every manifest that
pins `next`, `react` or `react-dom` (and `create-meith`'s `NEXT_VERSION`)
to `@meith/web`'s pins, so upgrading Next in one place and not the others
fails the check rather than shipping a scaffold that installs one version
and builds with another.

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
| `pnpm meith <command>` | The operator CLI against your `.env`. `--help` lists everything. |
| `pnpm test` | The whole unit suite. `pnpm test:watch` while you work. |
| `pnpm typecheck` | The workspace. `typecheck:app` and `typecheck:site` cover the two Next projects. |
| `pnpm lint` | Biome: formatting, lint rules and import order, in one pass. `pnpm format` writes the fixes. |
| `pnpm verify` | **The full static gate.** Run it before opening a pull request — see below. |
| `pnpm test:e2e` | Playwright: the no-JavaScript paths, the staff panels, and the accessibility checks. It builds the board and runs the standalone output against its own databases — nothing to install. `pnpm test:e2e:build` is the build on its own. |
| `pnpm site:shots` | Re-photographs meith.dev's screenshots against the demo board. Deliberate, never on CI — see [the site's screenshots](#the-sites-screenshots). |

`pnpm verify` is the one that matters. It runs, in order: the workspace
check and the verify/CI parity check, the root and release checks, the
guards and their probes, the message-catalog check, the slot checks, the
generated-document and documentation checks (`theme:docs`, `plugin:docs`,
`board:gen`, `hooks:wired`, `regions:wired`, `api:docs`, `perf:docs`, `docs:index`,
`docs:links`, `site:docs`, `marketplace:gen`, `board-installer:gen`,
`templates:gen`, `extension:gen`), lint, dependency-cruiser, all three
typecheck projects, and the full test suite.

**`pnpm verify` and CI's `static` job hold to each other.** `pnpm
ci:parity:check` reads the `verify` script and the `static` job out of
`.github/workflows/ci.yml` and fails, naming them, on any gate chained in
one and missing from the other — it is itself a gate in both. The one
exception is written out with its reason in `scripts/ci-parity.mjs`:
`verify` ends on `pnpm test`, while `static` runs the same suite as `pnpm
test:coverage` (a superset) and the `migrations` job runs it again against
real Postgres. `static` also runs steps that need CI's machine rather than
a developer's — packing every publishable tarball against its manifest,
the Redis cache-driver contract, coverage thresholds — so run `pnpm
test:coverage` yourself before a pull request that moves what is covered.
CI's other jobs build the image, drive a browser, and run the migrations
against real Postgres.

## No inline comments

`AGENTS.md` carries the rule: an explanation belongs in the document under
`docs/` that covers the behaviour, changed in the same commit, never in the
code. A comment is invisible to everyone who is not already reading that
function — an operator, a theme author, somebody deciding whether the
software does what they need — and it rots unnoticed, because nothing
checks a comment against the code beside it. A paragraph in `docs/` is read
by all of them and is checked: the links gate holds its anchors, the index
gate holds its registration, and the generated references fail when the
contract they describe moves.

The rule covers `/** */` as much as `//` — a JSDoc block that explains why
is an inline comment with decorative syntax. Four kinds of comment are not,
and are the only exceptions:

- **`biome-ignore` suppressions**, which the linter reads and which must
  carry a reason.
- **`@ts-expect-error`**, which the compiler reads.
- **Type annotations the compiler reads** — `@type`, `@satisfies`,
  `/// <reference>` — mostly in `.mjs` files with no other way to say it.
- **The prose in the six files a generated reference is built from**:
  `packages/theme-kit/src/{slots,api,view-models}.ts`, published by
  `pnpm theme:docs` as [the theme slot reference](../reference/theme-slots.md),
  and `packages/plugin-kit/src/{hooks,payloads,regions}.ts`, published by
  `pnpm plugin:docs` as [the plugin hook reference](../reference/plugin-hooks.md).
  There the comment *is* the published document.

### How it is enforced

Three layers, none of them CI, in the order they catch something. All three
scan with `scripts/comment-scan.mjs`, and compare against `HEAD` rather
than a checked-in allowlist — which is what lets them stay quiet about
comments already in the tree while refusing every new one.

- **`pnpm comments:check`** lists every comment your change adds. Run it
  before you finish.
- **The git `pre-commit` hook** (`.githooks/pre-commit`) runs the same
  check over the staged tree and refuses the commit, whoever or whatever
  wrote the code — `pnpm install` arms it via `core.hooksPath`.
  `git commit --no-verify` is the deliberate way past it.
- **A `PostToolUse` hook** (`.claude/hooks/no-inline-comments.mjs`) rejects
  a Claude Code file write on the spot — the fastest feedback, but it
  covers one tool, which is why it is not the layer the rule rests on.

Nothing in `pnpm verify` or CI checks for comments, deliberately: the rule
is about how the codebase is written, so enforcement sits where the writing
and committing happen, not on the branch.

## Formatting and lint

One tool does both: [Biome](https://biomejs.dev/), configured in
`biome.json` at the root. `pnpm lint` checks formatting, the lint rules and
import order and changes nothing; `pnpm format` writes the fixes.
`pnpm verify` runs the check, so a badly formatted file fails CI the same
way a lint error does.

The formatter is not configurable per file: single quotes, no semicolons,
two-space indent, 100 columns, and the version pinned exactly in
`package.json`. It covers TypeScript, JSX, JSON and CSS — everything except
the generator-written `docs/reference/perf-*.json` files. Markdown, YAML
and SQL have no formatter: `docs/`, the workflows and the migrations are
written by hand and reviewed as prose.

Three rules carry an invariant rather than a preference:

- **`style/noProcessEnv`.** `process.env` is read in
  `packages/core/src/env.ts` and nowhere else, so every variable is
  validated once at boot. `scripts/`, `apps/cli`, `apps/worker`, config
  files and tests are exempt in `biome.json`; `pnpm guards` enforces the
  same rule textually, catching reads in files Biome does not parse.
- **`scripts/no-group-ids.grit`.** A Biome plugin that fails on any read of
  `.groupIds` or `.primaryGroupId`. Group IDs must not leak outside
  `@meith/authorization` — ask the Authorizer
  `can(actor, action, target)` instead of branching on group membership.
  The modules that legitimately carry a group id as data are named by path
  in the plugin itself, because a plugin diagnostic cannot be suppressed on
  one line.
- **`suspicious/noConsole`.** The board logs through `logger()`. Processes
  that *are* their output — the CLI, the worker, the scripts, the e2e
  harness — are exempt.

Everything else is Biome's recommended set. Where a recommended rule is off
in `biome.json` it is because the codebase means the other thing — for
instance, `noDangerouslySetInnerHtml` would fire on every rendered post
body, and that safety argument is settled in `@meith/markdown`, the only
place rendered HTML comes from; `noImgElement` would ask for `next/image`
on a board that has to run without an image optimiser.

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
*server*, because the thing under test is behavior PGlite cannot
reproduce: `packages/db/src/client.pg.test.ts` exercises the client driver
PGlite bypasses, the migrate and install-repo tests need two connections
contending for a session-level lock, and
`packages/testkit/src/postgres-queue-pooled.pg.test.ts` needs each
connection to own its own backend — a wire server in front of one PGlite
funnels every client into a single backend whose one unnamed prepared
statement the connections then overwrite for each other.

They all skip unless `TEST_DATABASE_URL` is set:

```sh
docker compose -f docker/compose.dev.yml up -d
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/community_test pnpm test
```

CI's `migrations` job sets it, so "it passed locally" covers everything
except those seams — and CI covers them.

## Coverage

`pnpm test:coverage` runs the unit and integration suite with V8 coverage
and writes the HTML report to `coverage/index.html`. CI's `static` job runs
that command as its only pass over the suite — `--coverage` decides what is
measured, never what is collected, so it is `pnpm test` plus the
thresholds, not a second run.

The global thresholds prevent repository-wide regressions, and separate
floors for the worker, polls, attachments, and UI packages keep well-tested
packages from hiding a decline in those areas. Thresholds are a ratchet:
raise them when the measured baseline improves, and do not lower them
without documenting the reason in the same change. (`packages/drafts` is
interfaces only — erased at runtime, checked by `index.type-test.ts`, and
due a floor when it grows runtime behavior.)

## UI primitives and destructive actions

App components share the primitives in `@meith/ui` rather than re-declaring
the same class strings. A link that is prose — underlined, not a button —
is a `TextLink` (`@meith/ui`), whose `textLinkVariants` carries the one
underline recipe the whole board used to repeat inline; a link-styled
`<button>` reuses `textLinkVariants(...)` for the same reason. Reach for
these instead of writing `underline decoration-border …` again.

A **destructive action confirms itself, fallback-first.** The server action
calls `requireConfirmation(form, message)` (`server/confirm.ts`): when the
submission carries no `confirmed` field it returns the message and a
snapshot of the submitted fields as `state.confirm` and does nothing else.
The client `ConfirmDialog` renders that state two ways from one markup — a
`@meith/ui/dialog` `AlertDialog` when scripting is on, and, under
`<noscript>`, a plain interstitial that re-submits the snapshot with
`confirmed=1`. **The interstitial is the real path; the dialog is the
enhancement**, which is why the no-JS specs step through the confirm page
rather than skipping it (empty trash and delete-forever in
`undo-no-js.spec.ts`, post and thread deletion in `moderation-no-js.spec.ts`,
token revocation on the enhanced path in `admin-panel-live.spec.ts`). It is
applied to every destructive admin action that has no other guard: API
token revocation, attachment / announcement / prefix / word-filter / smiley
/ captcha-question / directive deletion, navigation-link deletion, and
ban-filter removal. Admin operations already guarded by the
preview-and-undo pattern (`admin-undo.tsx`) or a fresh-password re-check
(group and promotion-rule deletion) keep those guards instead, and three
one-click removals are deliberately left un-gated because they destroy
nothing that cannot be put straight back — the favicon and logo (re-upload)
and a badge definition.

A **notice is a toast, with the banner as its fallback.** Actions still
redirect carrying the notice in the query string; `BoardNotice` renders the
`@meith/ui/toast` `Toast` island — dismissible, auto-dismissing,
`role="status"` — and keeps the theme's `Notice` banner under `<noscript>`,
toggled by the same `data-`attribute-and-`<noscript>`-style pattern the
notification and user menus use. **Tooltips** (`@meith/ui/tooltip`) label
cramped icon controls such as the multiquote toggle; they open on hover and
focus, so the control still needs its own accessible name for touch and
screen readers.

## The browser suite

`pnpm test:e2e` starts everything it needs: a PGlite serving the Postgres
wire protocol, a built server running the standalone output against it, and
a second database and server for `/install`. There is nothing to install
and nothing to leave running.

The build comes first (`e2e/support/board-build.ts`; `pnpm test:e2e:build`
runs it alone) and needs no database — every route is dynamic, nothing is
prerendered. A cold build takes about a minute and an unchanged rebuild a
few seconds. Both servers run the same `server.js` from the same
`.next-e2e/standalone` tree, staged with `static` and `public/` the same
way `forum-web build` stages them, and differ only in `PORT`,
`DATABASE_URL` and `UPLOADS_DIR`. Running `npx playwright test` directly
skips the build and serves whatever was built last.

The suite used to drive `next dev`, whose per-route compilation made late
tests slow and CI shards fail under memory pressure; the built server
removed that mechanism rather than containing it, and the CI retry went
with it. **A browser test that fails intermittently now is a signal** —
usually a real race in the test or the product — and should be read rather
than retried. `e2e/support/flaky-notice.ts` stays wired so that if anyone
runs with `--retries` during triage, a test that failed and then passed
prints a warning instead of counting as plain green.

The `/install` database carries the schema and no rows, which is the state
a real board is in when someone opens `/install`: migrations run before the
board serves anything, and the installer checks the schema rather than
applying it.

**Most specs run with JavaScript disabled** — two-thirds of the suite. That
is the point rather than a flourish: the board's claim is that a native
`<form>` does the work and the islands are optional, so a suite that tested
only the enhanced path would prove the opposite. The JS-on specs are the
ones whose subject needs scripting — accessibility, passkeys, the content
security policy, the API, syndication, the screenshot tours — plus
`admin-panel-live.spec.ts`, an exception the rule needs: with scripting off
a form post is a full navigation, so a no-JS suite is blind to a panel
screen that does not refresh its own cached list.

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
asserts the username fits the board's 30-character maximum — the
registration input silently truncates a longer one, and the sign-in that
follows fails inexplicably.

The two-factor specs read both halves of the no-JS contract at once: every
authenticator-code field renders `OtpField`, a native text input that takes
a six-digit or recovery code with scripting off and upgrades to the
`@meith/ui` `InputOTP` boxes once scripting confirms.
`two-factor-no-js.spec.ts` signs in through the fallback,
`two-factor.spec.ts` through the widget, so the enhanced path is proven
without the fallback being torn out from under it.

**The suite shares one database across every spec, in file order** —
`workers: 1`, `fullyParallel: false`. A spec that changes something every
page shows (an announcement, a board setting, a pinned thread) must put it
back, or a later file fails for a reason nothing in that file can explain.
It shares the **scheduler** too: a spec that drives background work through
`/api/system/tick` can find a task not yet due if an earlier spec ticked,
so give such a spec its own `test.setTimeout` longer than the wait it asks
for. And `DATABASE_POOL_MAX` is `1` for the suite, so queries made
concurrent with `Promise.all` still serialise on the single connection.

**Passing is not enough — the run also fails on what the board logged.**
`e2e/support/server-errors.ts` reads the server's output and fails the run
on any unhandled server error, however many tests passed. It exists because
a green run once hid fifty-six of them.

The specs are typechecked by `pnpm typecheck` along with everything else —
Playwright transpiles without checking, so an uncompiled support file would
otherwise never fail at all. **CI shards the suite across four runners**,
each with its own databases and servers; every spec seeds what it needs, so
the split is safe in any order. `.next-e2e` is deliberately not cached
between CI runs — a restored build is the stale-cache problem, and a cold
build is cheap.

A built server is production, and three harness details follow from that:

- Password-reset tokens are not readable off the page outside development,
  so `account-security-no-js.spec.ts` reads the token out of the **e-mail**
  instead: `MAIL_DRIVER=http` points the board at
  `e2e/support/fake-mail.ts`, and `e2e/support/mailbox.ts` reads the inbox
  back — exercising the reset mail end to end.
- The e2e board deliberately does not know its own address:
  `admin-panel-live.spec.ts` asserts the warning about that, and
  `passkeys.spec.ts` needs to reach the board as `localhost`. The one test
  that needs an address sets it through the panel and puts it back.
- Production session cookies are `__Host-` prefixed and `Secure`. Chromium
  sends them over `http://127.0.0.1`, but Playwright's `page.request` will
  not — `signedHeaders()` in `e2e/support/session.ts` attaches the
  context's cookies to those calls. To drop one cookie, prefer
  `clearCookies({ name })` over rebuilding the jar.

**A known pre-existing order dependency.** Run serially in one process,
`admin-tabs-no-js.spec.ts` leaves something behind that makes
`formatting-no-js.spec.ts`'s server-side highlighting and
`formatting.spec.ts`'s attachment rendering fail. CI does not see it —
those specs land in different shards — and it is recorded here rather than
fixed because it is a separate bug.

## The site's pages

meith.dev is a marketing site with one argument — *built for communities,
owned by them* — and every page on it is a view of that argument from a
particular audience. The copy is data, not markup: every heading, lede and
link lives in `apps/web/src/content/`, and the pages under `apps/web/app/`
only lay it out.

| Route | Content | What it argues |
|---|---|---|
| `/` | `site.ts` | The broad case: ownership, permanence, independence, open source, predictable cost. It introduces developers and the audience pages and links into them rather than carrying their detail. |
| `/who-its-for` | `segments.ts` | The chooser: one card per audience. |
| `/who-its-for/developers` | `developers.ts` | The technical story — the board as a repository, fixture mode, the typed extension contracts and their counts, the measured performance, self-hosting, open source. Detailed developer copy belongs here, not on the homepage. |
| `/who-its-for/<segment>` | `segments.ts` | One templated page per remaining audience: open source, communities, clubs and associations, and MyBB/phpBB boards. |
| `/about` | `about.ts` | The ethos, as an essay: why the project exists, ownership and permanence, open source, handover, the code-first philosophy, the origin of the name, and the principles. It links into the audience pages rather than repeating them. |

The developer page has its own file because its shape differs from the
template; a new template audience is a new entry in `segments.ts` and
nothing else. Every route also renders an Open Graph card from the same
content (`app/og`, `app/who-its-for/og`, `app/about/og`), and the sitemap and the
header's menu read the audience list, so adding an audience adds it
everywhere at once. The old `/for/*` routes redirect permanently in
`apps/web/next.config.mjs`.

Numbers the pages quote — slot, hook and endpoint counts, the benchmark
board and its measurements — are read from the generated references at
build time by `apps/web/src/content/facts.ts`, so a figure the code no
longer supports fails the build rather than going stale on the page.

## The site's screenshots

Every image on meith.dev is a screenshot of a real board, and
`pnpm site:shots` is what takes them. They land in `apps/web/public/shots`,
and the site references them by name, so a rename there is a broken image
on the page.

It photographs the **demo board** — the twenty forums of `packages/demo`,
all five themes, and the Dues shop — rather than the behaviour specs'
fixture, whose content is written to be asserted rather than looked at.
That needs its own board on its own ports, so it has its own config
(`e2e/screenshot-site.config.ts`) rather than a project in
`playwright.config.ts`.

**It does not run on CI**, deliberately: the shots change whenever the
seed's relative timestamps move, so a run on every push would put megabytes
of visually identical PNGs into every pull request. Re-take them when the
board's appearance actually changes, and commit only the images that
differ.

Four facts about the demo board decide how the shots are taken, each
asserted in `e2e/screenshot-site.spec.ts` rather than left to hold on its
own: the demo strip publishes `admin / admin` and is hidden before each
shot; the seed holds a spam thread in the moderation queue, so shots are
taken as `member` rather than an administrator who can see it; a freshly
seeded board has indexed nothing and counted nothing, so the scheduler is
driven until search answers; and search is rate-limited, so the
light-and-dark pair is taken from the stored `/search/<token>` URL rather
than asking the search route twice.

## The checks that fail on purpose

Several gates in `pnpm verify` exist because something once passed every
other check and broke on a clean install. Each checks a fact about the
repository that nothing else reads:

| Script | What it catches |
|---|---|
| `workspace:check` | A package directory with sources and no `package.json`, or a manifest the lockfile has not seen. Both pass every other gate and fail `pnpm install --frozen-lockfile`, which is CI's first step. Also an `@meith/*` package a board installs that `next.config.mjs` does not compile — invisible in here, where the path aliases resolve to source, and red on every board-build job at once. |
| `ci:parity:check` | A gate chained in `pnpm verify` that runs in no step of `ci.yml`'s `static` job — the shape of defect that let six gates pass for a developer and merge green on a pull request. See [the commands](#the-commands). |
| `root:check` | A new file at the repository root. The root is an interface — every entry is registered with the reason it must live there. |
| `release:check` | A version written anywhere that disagrees with the release version, or a published package depending on a private one. See [Releasing](./release.md). |
| `guards` | Textual invariants — the things a grep can prove and a type cannot. `guards:probe` proves each guard still fires. |
| `i18n:check` | A message the code names and the catalog does not carry, a message nothing reads any more, a mirrored setting label that has drifted from the catalog, or a view builder that gained a hardcoded English string. See [Languages](../guides/operations/internationalisation.md). |
| `slots:check` | The server/client boundary in theme slots, in both directions. |
| `hooks:wired` | A hook fired by name that the registry does not declare — the typo that would otherwise be a call nothing listens to. It also derives the wired/unwired list that `pnpm plugin:docs` publishes. |
| `regions:wired` | A UI region declared in the registry that no call site in `apps/community` renders — the asymmetry that let `admin.dashboard` sit in the reference while rendering nowhere. It also flags a call site that renders a region the registry does not declare. |
| `theme:docs:check`, `plugin:docs:check`, `api:docs:check`, `perf:docs:check` | A generated reference that has drifted from the code it describes. |
| `board:gen:check` | Either board's `meith.plugins.ts` out of step with its `board.plugins.json` — see [the board plugin manifests](#the-board-plugin-manifests). |
| `marketplace:gen:check`, `board-installer:gen:check`, `templates:gen:check` | A published artifact generated from this repository that has drifted from its source: the marketplace feed meith.dev serves, the one-line board installer, and the `templates/` trees people actually deploy from. |
| `extension:gen:check` | `create-meith`'s plugin and theme scaffold templates out of step with `examples/hello-plugin` and `examples/iris-theme`, which they are generated from. |
| `docs:index:check`, `site:docs:check` | A document in `docs/` that the index does not link, or that is neither published on the site nor explicitly repository-only. |
| `docs:links:check` | An internal link or anchor under `docs/` that resolves to nothing — a renamed heading, a moved file, or a section that never existed. It also checks the `doc`/`anchor` pairs `apps/web` links back into `docs/`. See [documentation links](#documentation-links). |

One check runs in CI but deliberately **not** in `pnpm verify`:
`templates:sync:check` clones the two deploy-template repositories and
diffs each against its generated `templates/<target>/` tree. It needs the
network, which `verify` does not, so it lives in its own CI job — see
[Releasing](./release.md), "Deploy template repositories".

Three of those gates read the working tree rather than the index, so a
directory a tool leaves behind is a directory they scan. `root:check`
tolerates an unregistered root entry only when git ignores that entry
itself; `guards` and `i18n:check` share the walker in
`scripts/repo-files.mjs`, which skips build and tooling output by name —
`node_modules`, `dist`, `coverage`, `.meith`, `.claude` and their kind. A
new tool that writes into the tree belongs in both that list and
`.gitignore`, or every guard fires against copies of the repository.

## Documentation links

The site publishes `docs/` directly, so a heading renamed in one document
silently breaks every anchor pointing at it. `docs:links:check` resolves
every internal link and anchor: file targets, same-document and
cross-document anchors, `README.md` against the manifest, and the
`doc`/`anchor` pairs in the site's content modules — `apps/web/src/content/site.ts`,
`segments.ts`, `developers.ts` and `about.ts` — importing the
site's own `slugify` so the gate and the published page cannot disagree
about what a heading's anchor is.

When a link fails, the rules to know: a document's leading `# H1` is the
page title and gets no anchor of its own, repeated headings are numbered
`-1`, `-2` in document order, and anything inside a fenced code block is
not a heading.

## The board plugin manifests

This repository carries two boards, each with its own `board.plugins.json`
and generated `meith.plugins.ts`: `apps/community`, the in-repo dev
target, and `boards/stock`, the workspace the official image is built
from. `tests/boards-stock.test.ts` requires the two manifests to stay
identical, so a plugin installed into one and not the other fails
`pnpm verify`. Installing a plugin in this checkout means adding the
dependency to both boards — see
[the plugin API](../customization/plugins.md#writing-a-plugin).

`scripts/boards.json` is the one place the list of boards is written down;
both the generator (`pnpm board:gen`) and the CLI's
`plugin:add`/`plugin:remove` read it. Those commands only know how to
rewrite a manifest shaped `{ "plugins": [...] }` — one carrying any other
top-level field is refused rather than silently rewritten without it.
(`MEITH_BOARD_PLUGINS_ROOT` redirects the whole read/write root; only the
tests set it, so a real add-and-remove round trip never edits a fixture
tree's boards by accident — or vice versa.)

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
[`docs/README.md`](../README.md), and running:

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
| How the system fits together | [Architecture](../reference/architecture.md) |
| The conventions this codebase holds to | [Next.js conventions](./nextjs-conventions.md) |
| To write a theme | [The theme API](../customization/themes.md) |
| To write a plugin | [The plugin API](../customization/plugins.md) |
