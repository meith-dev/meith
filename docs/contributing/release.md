# Releasing

How a version of Meith is cut, what each release publishes, and the policy
that decides what a version number may contain. This is the maintainer's
document; the operator's side of the same story is
[Upgrading a board](../guides/operations/upgrading.md).

Everything here follows from one rule: **a release is a git tag `vX.Y.Z` on
a commit of `main` that CI has passed.** Pushing the tag runs
`.github/workflows/release.yml`, and every artifact a release produces comes
out of that one act. Nothing is published by hand, and no tag is ever
re-pointed.

## Cutting a release

1. **Check `main` is green.** The release pipeline re-runs the boot tests,
   not the whole gate. The gate is `main`'s job.
2. **Run Actions → *Cut a release*** with the version, `major.minor.patch`,
   no leading `v`. That workflow bumps the version everywhere, regenerates
   the documents that stamp it, proves the tree is coherent, commits
   `chore(release): vX.Y.Z` to `main`, and pushes the tag — which starts
   the Release workflow.
3. **Wait for the Release workflow.** It builds, boots and publishes, in the
   order [below](#what-the-release-workflow-does), stopping at the first
   failure.
4. **Finish the draft release.** Fill in the `Migrations:` line, trim the
   generated notes to what an operator needs, publish.

A version that would not move the tree forward is refused before anything is
written, and the bump always lands on `main` *before* the tag — tagging a
tree that still says the old version is exactly what `release-check --tag`
exists to refuse.

The same thing by hand, when the Actions tab is not an option:

```sh
pnpm release:bump 0.24.0
pnpm install --lockfile-only && pnpm release:check
git commit -am "chore(release): v0.24.0" && git push
git tag v0.24.0 && git push origin v0.24.0
```

### What the release workflow does

- **`release-check --tag`** — the tag and the tree agree.
- **The board image is built on each architecture's own runner** (no
  emulation) and booted in every role against a real Postgres: the migrator
  runs to completion, the web role serves and renders, the worker survives a
  tick and registers its tasks. Both architectures.
- **Only then are the images pushed** and merged under `X.Y.Z`, `X.Y` and
  `latest`.
- **The npm packages are published**, dependencies first. A re-run skips
  whatever already reached the registry, so a half-failed publish resumes
  rather than starts over. A name the registry has never seen is skipped
  with a notice, because only a person can make a first publish
  ([below](#a-packages-first-publish)).
- **`meith-base` is built and pushed**, one architecture per runner, merged
  under the exact version. It `npm install`s the just-published
  `@meith/web`, `@meith/cli` and `@meith/theme-default` from the real
  registry, so it runs after the npm job and fails the same way if one of
  those three was skipped as new.
- **A board is scaffolded from the packages that were just published**,
  installed from the real registry rather than from anything in this tree,
  and booted at both materialization depths.
- **The `release` branch is fast-forwarded** to the tag — refused if the tag
  is not descended from it, which is the guard against tagging a side
  branch.
- **The GitHub Release is drafted.**

**Why a check that runs after publishing is worth having.** 0.21.0 was cut to
fix a board that rendered raw message keys and shipped with only one of the
two fixes in it: a stacked pull request had merged into a base that had
already merged, so its commits never reached `main`. Nothing noticed — `main`
was green, the tag was coherent, the packages published, and the notes
described a fix that was not there. Every other gate in this repository
examines the repository; this one examines what a user downloads. It cannot
un-publish a bad version, and it is not meant to: `publish` waits on it, so a
broken artefact stops the release being announced and tells you within
minutes rather than after somebody deploys it.

### The notes say which kind of upgrade this is

[Upgrading a board](../guides/operations/upgrading.md#when-the-deploy-and-the-migration-are-separate-events)
promises operators that releases say which kind they are. The workflow drafts
every release with a **Migrations:** line the maintainer must complete —
*none*, *adds only*, or *removes or renames* — before publishing. A release
published with the placeholder still in it is a broken promise, which is why
the workflow drafts rather than publishes.

## What a release publishes

| Artifact | What it is |
|---|---|
| `ghcr.io/meith-dev/meith:X.Y.Z` | The board image — web, worker, migrator and operator CLI in one, for `linux/amd64` and `linux/arm64`. This tag never moves again, and it is the only tag anything deploys: the Coolify compose file pins it exactly. |
| `ghcr.io/meith-dev/meith:X.Y` | The release line, floating over its patches. A convenience for trying the image; nothing this repository ships deploys a floating tag. |
| `ghcr.io/meith-dev/meith:latest` | The newest release, whatever line it is on. Same status: for trying, never for deploying. |
| `ghcr.io/meith-dev/meith-base:X.Y.Z` | The framework base image a scaffolded custom board's own Dockerfile starts `FROM` — the `@meith/web`/`@meith/cli`/`@meith/theme-default` dependency closure, version-locked to this release, no board config and no secret (`docker/Dockerfile.base`). No floating tag: a board pins it exactly, the same way it pins the npm packages. See [Self-hosting § Custom boards](../getting-started/deployment/docker-compose.md#custom-boards). |
| The `@meith` packages on npm | The board, the kits, the first-party themes and plugins, `create-meith`, and their dependency closures — every non-private workspace package, at the release version, with provenance. See [what publishes to npm](#what-publishes-to-npm). |
| The `release` branch | Fast-forwarded to the tag. The Quickstart points Coolify at this branch, so a board deployed by the guide follows releases and never sees `main` mid-cycle. |
| A GitHub Release | Drafted by the workflow with generated notes and a header the maintainer must finish. |

No image tag except `X.Y` and `latest` is ever re-pushed. A release that turns
out to be broken gets a new patch release — cheaper than every operator
wondering which `v0.1.2` they have.

## The version policy

Semantic versioning, with the boundaries drawn by **migrations** rather than
API surface, because a schema change is the one thing an operator cannot
shrug off:

| Bump | May contain | May migrate? |
|---|---|---|
| **Patch** | Fixes only | **Never.** |
| **Minor** | Features, new settings, new migrations | Yes — additive by strong preference. |
| **Major** | Removals, renames, destructive backfills | Yes, including the kind that needs a two-step deploy. |

The patch rule is a promise: it is what makes "take the patch now, without
ceremony" always the right advice, however many patches a board is behind. A
fix that needs a migration is a minor release, whatever its size. (This is
maintainer policy — no gate compares a version bump against the migrations
directory — so it is a promise to keep, not a check to lean on.)

Two other rules live in the code and bind releases:

- **Upgrades span at most two majors** (`packages/upgrade`). Every major must
  keep its migrations correct against schemas up to two majors back, and that
  is the claim releases are tested against.
- **Downgrades are refused.** There is no down migration; recovery is by
  restore. Nothing in the release process may assume otherwise.

## One version, everywhere

The workspace releases in lockstep: the root `package.json` version is the
release version, and every workspace manifest carries the same one. The
packages are one tree at one commit — tested together, shipped together — and
per-package versions would claim an independence none of them has.

### Where the version is written

Beyond the manifests, the version appears in places npm never reads. They
divide into two kinds, and the difference decides how each is kept honest:

| Written in | What it is | Kept honest by |
|---|---|---|
| `apps/cli/src/upgrade.ts` (`CODE_VERSION`) | What `community upgrade` records in the database | `release:check` |
| `apps/community/src/server/upgrade-notice.ts` (`CODE_VERSION`) | What the admin panel compares the recorded version against | `release:check` |
| `packages/create-meith/src/bin.ts` | The version written into a scaffolded project's dependencies | `release:check` |
| `packages/marketplace/src/build-info.ts` (`MEITH_VERSION`) | This board's own version, checked against a listing's `meith` compatibility range | `release:check` |
| Each first-party plugin's `definePlugin` manifest | What `/admin/plugins` shows — the only one of these an operator ever sees | `release:check`, over **every** directory under `plugins/` |
| `docker/compose.coolify.yml` | The exact image tag the Coolify compose file pins | `release:check` |
| `marketplace/listings/*.json` whose `package` names a workspace package | The first-party listings — see [the marketplace](../customization/marketplace.md#what-is-in-a-listing) | `release:check`, over **every** listing in the directory |
| `docs/reference/openapi.json` | `info.version` of the generated API reference | `api:docs:check` |
| `apps/web/public/create-board.sh` | The installer [the Quickstart](../getting-started/deployment/coolify.md#2-create-your-board) points operators at, so nobody needs Node.js on their own machine | `board-installer:gen:check` |
| `templates/self-host` | The generated self-host deploy template (Coolify and Docker Compose) | `templates:gen:check` |
| `templates/vercel` | The generated Vercel deploy template | `templates:gen:check` |
| `apps/web/public/marketplace/v1.json` | The merged marketplace feed, a mirror of the listings above | `marketplace:gen:check` |

The first group is compared textually by `pnpm release:check`. The second is
*generated*, so a stale value is caught by the generator's own `--check`
instead. `pnpm release:bump` moves the first group and re-runs every
generator in the same command, so the release commit already carries fresh
documents. Before that, a bump left them behind and CI failed on the release
commit itself.

**Nothing fails at runtime if these drift, but the drift is visible.** The
plugin version once sat at `0.1.0` through two releases, so a board that had
just upgraded cleanly displayed a plugin two releases old. It happened a
second time — two plugins added after the check was written sat a release
behind, because the check named its plugins in a hardcoded list and nobody
extended it. So the plugin manifests and the marketplace listings are now
**discovered** rather than listed: `release:check` walks `plugins/` and
`marketplace/listings/` and covers whatever it finds, and a plugin whose
version it cannot read is an error rather than a silent omission. Adding a
plugin needs no edit here, which is the only version of this that stays true.

`release:check` runs in `pnpm verify` and in CI, and the release workflow runs
it with `--tag` so a tag that disagrees with its tree is refused before
anything is built. Its final line is the count of everything it checked —
that line, not this page, is the number to trust:

```
✓ release coherence: 0.23.0 in the root manifest, 58 workspace manifests,
  4 source constants, 4 plugin manifests, 8 first-party marketplace listings,
  and the compose pin; 52 packages publish to npm and the set is closed
```

The image additionally carries the version as `MEITH_VERSION` (an environment
variable and OCI labels, stamped by the workflow). A local `docker build`
leaves it at `0.0.0-dev`, and the entrypoint prints it at boot — so a
container's log always says whether it came from a release or a checkout.

### Why lockstep

Every package publishes at the release version, including ones the release
did not touch. That is a choice against per-package versioning, and the
reason is what these packages are: none of them is independent software. The
kits re-export the board's own contracts, the themes and plugins are compiled
into the board's build, and CI only ever tests one combination — the tree at
the tag. Lockstep makes the npm version state exactly what was tested:
`@meith/theme-phasebook@0.1.4` is the theme as board 0.1.4 shipped it, and
"board 0.1.4 with theme 0.1.2" is a mismatch anyone can see without a lookup
table.

The cost is that a version bump does not mean the package changed; the release
notes carry that information, as they do for every lockstep monorepo on npm
(Angular, Jest, the AWS SDK). A plugin's *schema* has its own version besides
— the one in its `definePlugin` manifest, which migrations are recorded
against — so "did this plugin's data model change" is already answered by a
number that only moves when it did.

The decision gets revisited the day something genuinely standalone joins the
set. Going from lockstep to independent later is versions diverging from a
shared point; the reverse is a renumbering nobody downstream enjoys, which is
why lockstep is the right place to start.

## What publishes to npm

**Every workspace package that is not `private: true`**, on every release, at
the release version. That is the whole rule — there is no allowlist to keep
in step, and `release:check`'s closing line counts them (52 at 0.23.0).

| | What is in it |
|---|---|
| The board | `@meith/web`, `@meith/cli` — the Next.js app and the operator CLI. Each carries a bin (`forum-web`, `community`) that materializes its sources into an external workspace and points the [board-config seam](../reference/architecture.md#the-board-config-seam) at that workspace's own files — see [Consuming the board from a workspace](./development.md#consuming-the-board-from-a-workspace). Without these two on npm, `create-meith`'s scaffold would depend on a package that does not exist. |
| The kits | `@meith/plugin-kit`, `@meith/theme-kit` — what a plugin or theme author writes against. |
| The board's dependency closure | Every domain and infrastructure package under `packages/` that `@meith/web` or `@meith/cli` names in its own `dependencies`, transitively — `@meith/accounts` through `@meith/upgrade`. None is independently useful; each is here only because the board, or a theme in its closure, imports it. |
| The themes | The five bundled themes: `default`, `midnight`, `phasebook`, `raidframe`, `clubhouse`. |
| The plugins | The first-party plugins: `dues`, `reference`, `webhooks`, `calendar`. |
| The initializer | `create-meith` — `npx create-meith` scaffolds a board whose `package.json` depends on `@meith/web`, `@meith/cli` and `@meith/theme-default`. An npx-able initializer that is not itself on npm does not exist. |

To ask whether a given package publishes, read its manifest: `private: true`
or not. To list them, `pnpm release:check` counts them and
`scripts/npm-publish.mjs --dry-run` names every one it would pack.

### What stays private, and why

- **`@meith/worker`** (`apps/worker`) — no [board-config seam](../reference/architecture.md#the-board-config-seam)
  import anywhere in its source, so it needs no per-installation
  customization the way the web app and CLI do, and `create-meith`'s scaffold
  does not depend on it. Something has to run the tick every minute (the
  worker process, or `community task:run`), but nothing about running it
  requires `@meith/worker` on the registry. Giving it a bin for a scaffolded
  workspace, the way `forum-web` and `community` have one, is orthogonal
  follow-up work.
- **`@meith/site`** (`apps/web`) — meith.dev itself. The project's own
  marketing site, not part of what an operator installs.
- **`@meith/board-stock`** (`boards/stock`) — the workspace `docker/Dockerfile`
  builds the official image from (see [the stock board](../reference/architecture.md)).
  It is a board, not a library, so it stays private the same way
  `apps/community` does; the version lockstep still applies to it, like every
  workspace manifest.
- **`@meith/testkit`** — it drags `@meith/db` and `@meith/drivers` behind it,
  and that closure is most of the board.
- **The examples** — `hello-plugin` and `iris-theme` are documentation. They
  are copied, not installed, and their `definePlugin` versions are deliberately
  their own rather than the release's.

### How packages are packed and published

`scripts/npm-publish.mjs` is the mechanism. Dependencies before dependents —
a `dependencies`, `peerDependencies` or `optionalDependencies` edge, so a
workspace-internal peer (the pattern themes and plugins already use for react)
orders and holds back exactly like a plain dependency would. A version already
on the registry is skipped rather than failed.

Each package is packed by `pnpm` — which rewrites the `workspace:` ranges into
real ones — and published by the `npm` CLI, which is what implements trusted
publishing.

**Every tarball is checked against its own manifest before anything is
published**: every non-excluded entry in `files` must have put something in
the tarball, and every `bin` target must be a real file in it. That is what
catches the failure mode a bare version bump cannot — a `files` allowlist that
still names a directory nothing is written into any more. Under `@meith/web`,
`app/` and `public/` are the two worth being paranoid about: nothing exercises
either externally except a board actually built from the published tarball,
and a `public/` left out of the allowlist costs web push its service worker
without failing anything inside this repository.

`--dry-run` stops at the packing and the tarball check; it never reaches the
registry. That is what makes it a gate a pull request can run at all — the
tree between releases carries a version that is already published, so asking
`npm publish --dry-run` about it would be told, correctly, that the version
cannot be published over, on every package, every time. Nothing is lost by
stopping earlier, because the failure this catches is a local disagreement
between a manifest and the tarball its own `files` allowlist produces.

CI's `static` job runs the dry run on every push and pull request
(`.github/workflows/ci.yml`), building `create-meith`'s `dist` first —
release.yml's `npm` job orders the same two steps the same way, since the dry
run packs `create-meith` from disk and only `pnpm build` writes its
`dist/bin.mjs`. That is the only packing coverage for a package outside the
`board-workspace` job's closure: a `files`-allowlist or `bin`-path rot in, say,
a theme or a domain package now fails on the pull request that caused it,
rather than mid-release after both architecture image builds have already
pushed tags.

### The set is closed, and closing it is the cost of publishing

A published package may not depend on a private one — that would be an `npm
install` that resolves for nobody. `release-check` enforces the closure across
`dependencies`, `peerDependencies` and `optionalDependencies` alike, so a
workspace-internal peer is exactly as disqualifying as a plain dependency:
publishing a package means deleting its `private: true`, and the check then
names everything that decision drags with it. That is how `@meith/core` and
`@meith/ui` entered the set — the kits and themes stand on them — and it is
the friction that keeps the set deliberate.

Dependency ranges between published packages are `workspace:^`, so a published
manifest says `^X.Y.Z` — the release line again. A plugin published at 0.1.0
accepts every 0.1 patch of the kits and refuses 0.2, the same compatibility
promise the image tags make.

### The npm surface is a compatibility commitment

Publishing `@meith/web` and `@meith/cli` makes "install this version of the
board, alongside this version of a theme or plugin" a real question with a
real answer — until they were published, that pairing only ever existed inside
this monorepo, at one commit. It is governed by the same policy that already
backs `apiVersion` for themes and plugins
([theme API versioning](../customization/themes.md#versioning),
[plugin API versioning](../customization/plugins.md#versioning)): a minor may
add capability, only a major may remove or rename it, and a package built
against one major keeps working against every release on that major.

`@meith/web`, `@meith/cli` and `@meith/theme-default` are not exempt from [the
version policy](#the-version-policy) just because they are new to npm. A
scaffolded board pins all three to an exact version rather than a range,
deliberately: `create-meith`'s scaffold upgrades by `npm install --save-exact
@meith/web@latest @meith/cli@latest @meith/theme-default@latest`, an explicit
act, never a silent range resolution on a board process holding a database
migration. The scaffolded `.npmrc` sets `save-exact=true` so the same holds
for an install run by hand, and the generated `build.yml` refuses to build
from anything but an exact version regardless.

A theme or plugin's `workspace:^` on the kits is the same policy stated as a
version range instead. Same guarantee, different mechanism for the different
risk: a board upgrade runs migrations, a theme or plugin upgrade does not.

### They ship TypeScript source, deliberately

A theme or plugin is only ever consumed inside a board's Next build, and that
build compiles these packages **from source** wherever they come from — the
workspace today (`transpilePackages` in the board's Next config, Tailwind's
`@source` scan for class names), npm tomorrow. So the published tarball is the
`src/` directory the monorepo tests, byte for byte, minus the test files.
There is no dist step, which means there is no way for the published artifact
to drift from what CI exercised.

Two consequences bind whoever wires an npm-installed package into a board
build — the same two the monorepo already handles for the first-party set:

- the package's name must be in the board's `transpilePackages` — a workspace
  package is compiled because it lives outside `node_modules`; an npm one is
  not;
- a theme or plugin needs a Tailwind `@source` entry for its `node_modules`
  path, or its class names are silently dropped from the stylesheet and its
  pages render unstyled with no error anywhere.

The one package this does not describe is `create-meith`: its published `bin`
runs under plain `node`, invoked by `npx` — never inside a board's Next build,
so there is no bundler on the other end to compile it from source. Node's own
native TypeScript support refuses to strip types for a file under
`node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), which is where
npm always installs a package before running its bin — so a `bin` entry
pointing at raw `.ts` fails for every real `npx create-meith`, even though it
runs fine from this repository's own tsx-driven tooling, where the failure
would never surface. `create-meith`'s own `pnpm build` (esbuild, bundling
`src/bin.ts` to `dist/bin.mjs`) is the one dist step in the published set, and
the release workflow's `npm` job runs it immediately before
`node scripts/npm-publish.mjs`.

### How the workflow authenticates

**Trusted publishing, not a token.** Each package on npmjs.com names this
repository and the `release.yml` workflow as its trusted publisher. When the
release workflow runs, npm exchanges the job's OIDC identity for a short-lived
credential scoped to that publish, and provenance is generated automatically.
There is no long-lived secret to leak, rotate, or scope too widely — a package
can only be published by this repository's release workflow, and npmjs.com
shows exactly that on the package page.

Two consequences worth knowing:

- **Configuration lives on npmjs.com, per package**: package → Settings →
  Trusted Publisher → GitHub Actions, with the organisation (`meith-dev`),
  repository (`meith`) and workflow filename (`release.yml`). Renaming the
  workflow file breaks publishing until every one of those configurations is
  updated; the failure is a clear authentication error at the npm job.
- **A brand-new package cannot first-publish this way**, because trusted
  publishing attaches to a package that already exists. The release does not
  attempt it: a name the registry has never seen is skipped with a notice, and
  the rest of the release goes out.

## Deploy template repositories

Two deploy routes start from a repository the operator clones rather than from
this one: **[meith-dev/template](https://github.com/meith-dev/template)** is the
"Use this template" repository behind the self-host Quickstart (Coolify and
Docker Compose both), and
**[meith-dev/vercel-template](https://github.com/meith-dev/vercel-template)** is
what the Vercel Deploy Button clones. Their contents are *generated*, not
hand-written: `templates/self-host/` and `templates/vercel/` here are the source
of truth, written by `pnpm templates:gen` from `create-meith`'s `scaffold()` and
held current by `pnpm templates:gen:check` (part of `pnpm verify`).

The `publish-templates` job in `release.yml` mirrors each committed tree into
its repository on every release: it clones the repository, makes its tracked
tree match `templates/<target>/` exactly — adding, updating and **deleting** so
the two agree file for file — commits `chore(release): sync template to vX.Y.Z`
when anything changed, and tags the repository `vX.Y.Z`. It runs after
`publish`, so a release that did not ship never pushes a template, and it is
idempotent: a re-run with nothing to change makes no commit.

The tracked content of each repository is **owned entirely** by its
`templates/<target>/` source — anything the source does not contain, the mirror
removes. A file a repository needs, such as a `LICENSE`, belongs in the scaffold
so the source carries it, never added to the repository by hand. `pnpm
templates:sync:check` verifies in CI that the repositories still match the
generated trees, so drift is a red build rather than a stale board a new adopter
clones.

**The push credential.** `GITHUB_TOKEN` grants write to this repository only, so
the cross-repository push authenticates as a **GitHub App** — chosen because,
unlike a personal access token, it does not expire and so needs no scheduled
rotation. Create an organisation-owned App with the **Contents: read and write**
and **Workflows: read and write** repository permissions — the mirror includes
`.github/workflows/build.yml`, and GitHub rejects an App push that creates or
updates any file under `.github/workflows/` without the Workflows permission, so
`Contents` alone syncs every file until a workflow one changes and then fails the
whole push. Install it on `meith-dev/template` and
`meith-dev/vercel-template` (approving the Workflows permission on the
installation if you add it later), and store its **App ID** and a generated
**private key** as the Actions secrets `TEMPLATE_SYNC_APP_ID` and
`TEMPLATE_SYNC_APP_PRIVATE_KEY` here. The `publish-templates` job mints a
short-lived installation token from them on each run
(`actions/create-github-app-token`, scoped to just those two repositories) and
hands it to `templates:sync` as `TEMPLATE_SYNC_TOKEN`; the only stored secret is
the key, and nothing expires on a clock. Without the App configured the job logs
a warning and does nothing, so releases still succeed — add the two secrets
before the first release that should propagate templates. The repositories are
created once, up front, with `meith-dev/template` marked as a *template
repository* in its settings so the "Use this template" button appears.

## How each route consumes a release

| Route | What it tracks | How an upgrade arrives |
|---|---|---|
| [Quickstart](../getting-started/deployment/coolify.md) (Coolify) | The `release` branch; the compose pin on the exact version, held per resource by `MEITH_IMAGE` | Every release moves the pin, so an upgrade is a **Redeploy** after the branch moves — or automatic, with the webhook on. Never from a push to `main`. Coolify's **Restart** re-runs the deployment from the branch head, so unpinned it upgrades too — the Quickstart has the operator pin `MEITH_IMAGE` so it cannot. |
| [By hand](../getting-started/deployment/docker-compose.md) (Compose) | A release tag in a clone | `git fetch --tags && git checkout vX.Y.Z`, rebuild. Building from source is the point of that route; the published image is the alternative for small machines. |
| meith.dev and demo.meith.dev | `main` | The project's own resources, deliberately ahead of any release: the demo shows what is coming, and both redeploy on push. Nobody self-hosting should copy this arrangement. |

### Deploys are deterministic, and that is load-bearing

The compose file names an exact, immutable version. No deploy path resolves
"the newest anything": a version change always has a commit on the `release`
branch behind it, which is what makes "what is this board running, and since
when" answerable from git history. It also keeps a bad release contained — a
board that has not deployed the new pin is not running it.

The determinism is per *commit*, though, not by itself per resource: Coolify
re-reads the compose file from the branch head on every deploy action, and on
a compose resource that includes the panel's **Restart** button, which re-runs
the deployment rather than restarting containers. A crash or a reboot
re-creates the running version; a button in the panel deploys whatever release
the branch has moved to. What makes a *resource* deterministic is
`MEITH_IMAGE` in its environment: it overrides the file's default, so Restart
and Redeploy re-create exactly that version — which is why the Quickstart
tells the operator to set it, and why holding back from a release is simply
not moving it yet. The same variable serves the operator who wants a stronger
pin than a tag: a digest, immune even to a re-pushed tag.

The same reasoning runs through the rest of the pipeline. The base images —
`node`, `postgres`, `valkey`, `alpine`, `curl` — are pinned by digest in the
Dockerfiles and compose files, not by tag alone, and every action in the
workflows is pinned to a full commit SHA with the version tag kept as a
comment: the workflows hold publish rights, and a re-tagged action is code
they would run. Dependabot moves all of these pins on the same weekly schedule
as the npm dependencies, so the pinning costs review, not staleness.

That last clause is what bounds where a pin belongs. The `docker` and
`docker-compose` ecosystems in `.github/dependabot.yml` are scoped to
`docker/`, so a digest written by hand anywhere else is a digest nothing ever
moves — pinning costing staleness rather than review, which is the trade this
section exists to avoid. Where something outside `docker/` needs one of these
images, it therefore *reads* the pinned value instead of repeating it:
`scripts/board-eject-smoke.mts` takes the `psql` client it shells out to from
`docker/compose.yml`'s `postgres` service, through `pinnedComposeImage`
(`scripts/compose-images.mts`), so the smoke runs a digest and still follows
the weekly bump without carrying a second copy of it.

The throwaway Postgres that GitHub Actions starts as a job's `services:`
container is the deliberate exception, and stays on the bare
`postgres:18-alpine` tag. It is created empty for one job and discarded with
it, nothing it holds outlives the run, and no Dependabot ecosystem reads a
workflow's `services:` block — so a digest there would rot in place while
buying nothing. A bare tag in a `services:` block is a decision, not an
oversight; a bare tag in a Dockerfile, a compose file, or a script that reads
one is the bug.

## One-time setup

### The deploy key the cut workflow pushes with

The cut workflow pushes straight to `main`, and a ruleset requiring pull
requests blocks that (`GH013`, at the push step, before anything is tagged).
Rulesets cannot grant bypass to the built-in Actions app, so the workflow
pushes over SSH with a **deploy key** instead, which rulesets *can* bypass.
The key solves a second problem at the same time: a tag pushed with
`GITHUB_TOKEN` triggers no workflows (GitHub's recursion guard), while a
deploy-key push starts the Release workflow the ordinary way.

1. `ssh-keygen -t ed25519 -f meith-release -N ""` — anywhere; delete both
   files once the two halves are stored.
2. **Settings → Deploy keys → Add deploy key**: the public half
   (`meith-release.pub`), with **Allow write access** ticked.
3. **Settings → Secrets and variables → Actions → New repository secret**:
   `RELEASE_DEPLOY_KEY`, the private half (the whole file, header and footer
   included).
4. **Settings → Rules → Rulesets → the rule on `main` → Bypass list → add
   "Deploy keys"**.

The protection keeps applying to people and to every app; the one thing
allowed through is a key that exists only as this repository's secret, used
only by this workflow, revocable in one click. The workflow is safe to re-run
after a failure at any step: a tree already bumped, a commit already pushed,
or a tag already made is skipped rather than refused.

### The first release

One-time steps around `v0.1.0`, in order:

1. Tag and push; the workflow publishes the image and creates the `release`
   branch by pushing it.
2. **Make the GHCR package public.** The first push creates
   `ghcr.io/meith-dev/meith` private, and a private package is a quickstart
   that fails at `docker pull` with an authentication error no operator can
   act on. Package settings → change visibility → public.
3. **Create the npm organisation, and publish each package by hand once.** The
   `meith` organisation owns the `@meith` scope, and a package's very first
   publish is made from a maintainer's own machine — the workflow cannot make
   one. [A package's first publish](#a-packages-first-publish) is the
   procedure; from then on the workflow authenticates with trusted publishing
   and no token exists to leak.
4. Protect the `release` branch from manual pushes, so the workflow's
   fast-forward is the only thing that moves it.

### A package's first publish

npm has no way to name a trusted publisher for a package that does not exist
yet ([npm/cli#8544](https://github.com/npm/cli/issues/8544) is the open
request), so a first publish comes from a person, once, and every release
after it is ordinary OIDC. The shape of it — substitute the directory and
name:

```sh
npm login
cd themes/clubhouse
pnpm pack --out /tmp/pack.tgz
npm publish /tmp/pack.tgz --access public
npm trust github @meith/theme-clubhouse \
  --repo meith-dev/meith --file release.yml --allow-publish
```

Each line is load-bearing:

- **`npm login`, not a token.** Creating a package is exactly the act that
  should carry 2FA, and a CI token cannot answer a 2FA prompt — the only token
  that publishes unattended is one marked *bypass 2FA*, which is a long-lived
  secret with the run of the whole scope, the thing this arrangement exists to
  avoid.
- **`pnpm pack`, not `npm publish .`.** pnpm rewrites the `workspace:` ranges
  into real ones. A manifest published with `workspace:^` still in it is an
  `npm install` that resolves for nobody.
- **`npm trust`** configures the trusted publisher from the terminal — the
  same thing as the package's settings page on npmjs.com. It needs npm 12 or
  newer. Without it the package publishes this once and then fails every
  release after, at authentication.

Do this **before** tagging and the release publishes the package like any
other. Do it after and the package is one release behind — re-running the
Release workflow against the tag catches it up, since a run publishes whatever
is missing and skips whatever is already there. A package that *depends* on a
skipped one is held back too, and the job says so; publishing the new package
by hand and re-running the workflow clears both together.
