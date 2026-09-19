# Board workspaces and build materialization

Understand the monorepo, external board workspaces and generated board registry. This reference is for contributors changing packaging or the boundary between a board and the engine.

## The workspace

A pnpm workspace: applications in `apps/`, everything else in `packages/`,
`themes/` and `plugins/`.

| Directory | Package | What it is |
|---|---|---|
| `apps/community` | `@meith/web` | The board itself, and the in-repo dev target. `pnpm dev`, on port 3000. |
| `apps/web` | `@meith/site` | meith.dev — the landing page and these documents. `pnpm site:dev`, on port 3100. |
| `apps/worker` | `@meith/worker` | The background tick, as a long-running process. |
| `apps/cli` | `@meith/cli` | The operator CLI. `pnpm meith …`. |
| `boards/stock` | `@meith/board-stock` | A second, create-meith-shaped board — the workspace `docker/Dockerfile` builds the official image from. See [Architecture](architecture.md). |
| `packages/*` | `@meith/*` | The domain: accounts, forums, posts, authorization, search, drivers, and the rest. |
| `themes/*` | `@meith/theme-*` | The default theme, four bundled alternates (midnight, phasebook, raidframe, clubhouse) and `meith`, the editorial theme for meith.dev's own forum, which publishes to npm and is registered only behind `SHOWCASE_THEMES`, not in the stock theme set. |
| `plugins/*` | `@meith/plugin-*` | Dues (paid membership through Stripe), calendar (shared events linked to threads) and the reference plugin. Outbound webhooks are a core feature — see [Webhooks](../integrations/webhooks.md). |
| `examples/*` | — | Reference code to copy, not installed: `hello-plugin` and `iris-theme`. See [`examples/README.md`](https://github.com/meith-dev/meith/tree/main/examples). |

> [!TIP]
> The two directory names are easy to swap: `apps/community` is the board
> (package `@meith/web`), while `apps/web` is the marketing site (package
> `@meith/site`).

Every `@meith/*` import resolves through tsconfig path aliases straight to
`src/index.ts`. There is no build step between packages, which is why a
typecheck is fast and why `pnpm workspace:check` exists — see
[the checks that fail on purpose](repository-checks.md#the-checks-that-fail-on-purpose).

Outside the workspace: `docker/` is the whole deployment interface — the
compose files, the Dockerfiles, the entrypoint and the healthcheck. The
compose files read their `.env` from beside them, which is why the deploy
guides say `cd meith/docker`. The repository root is a registry, not a
landing zone: every entry in it is listed in `scripts/root-check.mjs` with
the reason it must live there, and `pnpm root:check` fails on a new root
file until it is either moved into a folder or registered with a reason.

How the packages relate — the layers, what may import what, and why — is
[Architecture](architecture.md).

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
[board-config seam](architecture.md) —
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

**Fixture mode covers `forum-web dev`, `forum-web build` and `forum-web start`.**
Running the built fixture server needs `AUTH_SECRET`; it serves the same
read-only sample content without a database. PostgreSQL boards require a
durable queue and scheduler secrets because queued work must survive restarts.

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

When updating Next.js, also align `packages/drivers/package.json`'s exact
peer dependency and `create-meith`'s `NEXT_VERSION`, then run
`pnpm board-installer:gen` and `pnpm install`. Leave the committed deploy
templates unchanged until release; `pnpm release:bump` regenerates them.
The release workflow checks template freshness before publishing npm packages;
normal CI tests the generator without requiring the released trees to change.
Conflicting Next.js installations can fail packed-board prerendering with
`Expected workStore to be initialized` even when the repository build passes.

**The Vercel target turns the mode on; nothing else does.** `scaffold()`'s
`target: 'vercel'` tree carries the flag in `vercel.json`'s `buildCommand`
(`meith migrate && forum-web build --at-root`) and in its own scripts, so a
board built locally and on the platform materialize to the same place. The
self-host target is untouched. At release, `pnpm templates:gen:check` ties the
generated `templates/self-host/` and `templates/vercel/` trees back to
`scaffold()`.

## The board plugin manifests

This repository carries two boards, each with its own `board.plugins.json`
and generated `meith.plugins.ts`: `apps/community`, the in-repo dev
target, and `boards/stock`, the workspace the official image is built
from. `tests/boards-stock.test.ts` requires the two manifests to stay
identical, so a plugin installed into one and not the other fails
`pnpm verify`. Installing a plugin in this checkout means adding the
dependency to both boards — see
[the plugin API](../extensions/plugins.md).

`scripts/boards.json` is the one place the list of boards is written down;
both the generator (`pnpm board:gen`) and the CLI's
`plugin:add`/`plugin:remove` read it. Those commands only know how to
rewrite a manifest shaped `{ "plugins": [...] }` — one carrying any other
top-level field is refused rather than silently rewritten without it.
(`MEITH_BOARD_PLUGINS_ROOT` redirects the whole read/write root; only the
tests set it, so a real add-and-remove round trip never edits a fixture
tree's boards by accident — or vice versa.)

## Board configuration and test plugins

Application and CLI code import the selected board through `@board/config` and `@board/plugins`. Do not reach into `apps/community` with a relative import of `meith.config.ts`, `meith.plugins.ts` or `meith.test.plugins.ts`: external board workspaces provide their own files through those aliases. The configuration files may import each other as part of defining that board.

`apps/community/meith.test.plugins.ts` supplies Awards, Calendar and test-configured Dues only when `DUES_TEST_BOARD=1`. Its Dues definition seeds test plans and permits the loopback payment service used by browser tests. These are test-board defaults, not production payment configuration. The generated registry combines the test plugins with manifest-installed plugins; keep this behavior when changing the generator.

The `no-relative-board-config-import` guard enforces the import boundary. The stock and development manifests remain synchronized, while a scaffolded external board owns its own manifest.
