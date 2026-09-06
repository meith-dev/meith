# Releasing

How a version of Meith is cut, what each release publishes, and the policy
that decides what a version number may contain. This is the maintainer's
document; the operator's side is [Upgrading a board](../operating/upgrading.md).

**A release is a git tag `vX.Y.Z` on a commit of `main` that CI has
passed.** Pushing the tag runs `.github/workflows/release.yml`, which
produces every artifact. Nothing is published by hand, and no tag is ever
re-pointed.

## Cutting a release

1. **Check `main` is green.** The release pipeline re-runs the boot tests,
   not the whole gate.
2. **Run Actions → *Cut a release*** with the version, `major.minor.patch`,
   no leading `v`. That workflow bumps the version everywhere, regenerates
   the documents that stamp it, proves the tree is coherent, commits
   `chore(release): vX.Y.Z` to `main`, and pushes the tag, which starts the
   Release workflow.
3. **Wait for the Release workflow.** It builds, boots and publishes, in the
   order [below](#what-the-release-workflow-does), stopping at the first
   failure.
4. **Finish the draft release.** Fill in the `Migrations:` line, trim the
   generated notes to what an operator needs, publish.

A version that would not move the tree forward is refused before anything is
written. The bump lands on `main` before the tag: `release-check --tag`
refuses a tag on a tree that still says the old version.

The same thing by hand, when the Actions tab is not an option:

```sh
pnpm release:bump 0.24.0
pnpm install --lockfile-only && pnpm release:check
git commit -am "chore(release): v0.24.0" && git push
git tag v0.24.0 && git push origin v0.24.0
```

### What the release workflow does

The jobs, in dependency order:

- **`versions`** runs `release-check --tag`: the tag and the tree agree.
- **`build`** builds the board image on each architecture's own runner, with
  no emulation, and boots it in every role against a real Postgres: the
  migrator runs to completion, the web role serves and renders, the worker
  survives a tick and registers its tasks. Each runner then pushes only its
  arch-suffixed tag, `X.Y.Z-amd64` or `X.Y.Z-arm64`.
- **`npm`** publishes the packages, dependencies first. A re-run skips
  whatever already reached the registry. A name the registry has never seen
  is skipped with a notice; only a person can make a first publish
  ([below](#a-packages-first-publish)).
- **`published-board`** scaffolds a board from the packages just published,
  installed from the real registry, and boots it at both materialization
  depths (`pnpm published:board:smoke`).
- **`base-image`** builds and pushes `meith-base`, one architecture per
  runner. It `npm install`s the just-published `@meith/web`, `@meith/cli` and
  `@meith/theme-default` from the real registry, so it runs after the npm
  job and fails the same way if one of those three was skipped as new.
- **`publish`** waits for `build`, `npm`, `base-image` and `published-board`,
  then merges the architecture tags under `X.Y.Z`, `X.Y` and `latest`, merges
  the base image under its exact version, fast-forwards the `release` branch
  to the tag, and drafts the GitHub Release. The branch push is
  fast-forward only: a tag not descended from `release` is refused.
- **`publish-templates`** mirrors the deploy templates into their
  repositories ([below](#deploy-template-repositories)).

`published-board` exists because 0.21.0 shipped with only one of its two
fixes: a stacked pull request's commits never reached `main`, while `main`
was green and the tag coherent. This gate examines what a user downloads,
and `publish` waits on it.

### The notes say which kind of upgrade this is

[Upgrading a board](../operating/upgrading.md#when-the-deploy-and-the-migration-are-separate-events)
promises operators that releases say which kind they are. The workflow drafts
every release with a **Migrations:** line the maintainer must complete,
*none*, *adds only*, or *removes or renames*, before publishing.

## What a release publishes

| Artifact | What it is |
|---|---|
| `ghcr.io/meith-dev/meith:X.Y.Z` | The board image: web, worker, migrator and operator CLI in one, for `linux/amd64` and `linux/arm64`. This tag never moves again, and it is the only tag anything deploys: `docker/compose.coolify.yml` pins it exactly. |
| `ghcr.io/meith-dev/meith:X.Y` | The release line, floating over its patches. For trying the image; nothing this repository ships deploys a floating tag. |
| `ghcr.io/meith-dev/meith:latest` | The newest release, whatever line it is on. Same status: for trying, never for deploying. |
| `ghcr.io/meith-dev/meith-base:X.Y.Z` | The framework base image a scaffolded board's `Dockerfile.prebuilt` starts `FROM`: the `@meith/web`/`@meith/cli`/`@meith/theme-default` dependency closure, version-locked to this release, no board config and no secret (`docker/Dockerfile.base`). No floating tag: a board pins it exactly, the same way it pins the npm packages. See [Deploying by hand § Building somewhere else](../setting-up/deployment/docker-compose.md#building-somewhere-else). |
| The `@meith` packages on npm | The board, the kits, the first-party themes and plugins, `create-meith`, and their dependency closures: every non-private workspace package, at the release version, with provenance. See [what publishes to npm](#what-publishes-to-npm). |
| The `release` branch | Fast-forwarded to the tag, so `git log release` is the history of what has been released. No deploy route reads it: a scaffolded board follows its own repository, and `docker/compose.coolify.yml` is pinned by version, not by branch. |
| A GitHub Release | Drafted by the workflow with generated notes and a header the maintainer must finish. |

No image tag except `X.Y` and `latest` is ever re-pushed. A broken release
gets a new patch release.

## The version policy

Semantic versioning, with the boundaries drawn by **migrations** rather than
API surface:

| Bump | May contain | May migrate? |
|---|---|---|
| **Patch** | Fixes only | **Never.** |
| **Minor** | Features, new settings, new migrations | Yes, additive by strong preference. |
| **Major** | Removals, renames, destructive backfills | Yes, including the kind that needs a two-step deploy. |

The patch rule is what makes "take the patch now" always safe. A fix that
needs a migration is a minor release, whatever its size. No gate compares a
version bump against the migrations directory, so this is a promise to keep,
not a check to lean on.

Two other rules live in the code and bind releases:

- **Upgrades span at most two majors** (`packages/upgrade`). Every major must
  keep its migrations correct against schemas up to two majors back.
- **Downgrades are refused.** There is no down migration; recovery is by
  restore.

## One version, everywhere

The workspace releases in lockstep: the root `package.json` version is the
release version, and every workspace manifest carries the same one.

### Where the version is written

Beyond the manifests, the version appears in places npm never reads. They
divide into two kinds, and the kind decides how each is kept honest:

| Written in | What it is | Kept honest by |
|---|---|---|
| `apps/cli/src/upgrade.ts` (`CODE_VERSION`) | What `meith upgrade` records in the database | `release:check` |
| `apps/community/src/server/upgrade-notice.ts` (`CODE_VERSION`) | What the admin panel compares the recorded version against | `release:check` |
| `packages/create-meith/src/bin.ts` | The version written into a scaffolded project's dependencies | `release:check` |
| `packages/marketplace/src/build-info.ts` (`MEITH_VERSION`) | This board's own version, checked against a listing's `meith` compatibility range | `release:check` |
| Each first-party plugin's `definePlugin` manifest | What `/admin/plugins` shows, the only one of these an operator ever sees | `release:check`, over **every** directory under `plugins/` |
| Each first-party theme's `defineTheme` manifest | The version each theme declares for itself, validated by `@meith/theme-kit` | `release:check`, over **every** directory under `themes/` |
| `docker/compose.coolify.yml` | The exact image tag the stock-image Coolify compose file pins | `release:check` |
| `marketplace/listings/*.json` whose `package` names a workspace package | The first-party listings, see [the marketplace](./marketplace.md#what-is-in-a-listing) | `release:check`, over **every** listing in the directory |
| `docs/reference/openapi.json` | `info.version` of the generated API reference | `api:docs:check` |
| `apps/web/public/create-board.sh` | The installer [Deploying with Coolify](../setting-up/deployment/coolify.md#2-create-your-board) points operators at, so nobody needs Node.js on their own machine | `board-installer:gen:check` |
| `templates/self-host` | The generated self-host deploy template (Coolify and Docker Compose) | `templates:gen:check` |
| `templates/vercel` | The generated Vercel deploy template | `templates:gen:check` |
| `apps/web/public/marketplace/v1.json` | The merged marketplace feed, a mirror of the listings above | `marketplace:gen:check` |

The first group is compared textually by `pnpm release:check`. The second is
generated, so a stale value is caught by the generator's own `--check`.
`pnpm release:bump` moves the first group and re-runs every generator in the
same command.

Nothing fails at runtime if these drift. The plugin version once sat at
`0.1.0` through two releases, and later two plugins sat a release behind
because the check named its plugins in a hardcoded list. So the plugin and
theme manifests and the marketplace listings are **discovered**:
`release:check` walks `plugins/`, `themes/` and `marketplace/listings/`,
and a manifest whose version it cannot read is an error.

`release:check` runs in `pnpm verify` and in CI, and the release workflow runs
it with `--tag`. Its final line counts everything it checked, and that line,
not this page, is the number to trust:

```
✓ release coherence: 0.35.1 in the root manifest, 59 workspace manifests, 4 source constants, 3 plugin manifests, 5 theme manifests, 7 first-party marketplace listings, and the compose pin; 53 packages publish to npm and the set is closed
```

The image also carries the version as `MEITH_VERSION`, an environment
variable and OCI labels stamped by the workflow. A local `docker build`
leaves it at `0.0.0-dev`, and the entrypoint prints it at boot.

### Why lockstep

Every package publishes at the release version, including ones the release
did not touch. None is independent software: the kits re-export the board's
contracts, the themes and plugins are compiled into the board's build, and
CI only tests one combination, the tree at the tag. So
`@meith/theme-phasebook@0.1.4` is the theme as board 0.1.4 shipped it.

A version bump therefore does not mean the package changed; the release
notes carry that. A plugin's *schema* has its own version, the one in its
`definePlugin` manifest that migrations are recorded against, which only
moves when the data model did.

## What publishes to npm

**Every workspace package that is not `private: true`**, on every release, at
the release version. There is no allowlist, and `release:check`'s closing
line counts them (53 at 0.35.1).

| | What is in it |
|---|---|
| The board | `@meith/web`, `@meith/cli`: the Next.js app and the operator CLI. Each carries a bin (`forum-web`, `meith`) that materializes its sources into an external workspace and points the [board-config seam](./architecture.md#the-board-config-seam) at that workspace's own files; see [Consuming the board from a workspace](./development.md#consuming-the-board-from-a-workspace). Without these two on npm, `create-meith`'s scaffold would depend on a package that does not exist. |
| The kits | `@meith/plugin-kit`, `@meith/theme-kit`: what a plugin or theme author writes against. |
| The board's dependency closure | Every domain and infrastructure package under `packages/` that `@meith/web` or `@meith/cli` names in its own `dependencies`, transitively, `@meith/accounts` through `@meith/upgrade`. None is independently useful; each is here because the board, or a theme in its closure, imports it. |
| The themes | The five bundled themes: `default`, `midnight`, `phasebook`, `raidframe`, `clubhouse`. |
| The plugins | The first-party plugins: `dues`, `reference`, `calendar`. |
| The initializer | `create-meith`: `npx create-meith` scaffolds a board whose `package.json` depends on `@meith/web`, `@meith/cli` and `@meith/theme-default`. |

Whether a package publishes is its manifest's `private: true` or not.
`pnpm release:check` counts them and `scripts/npm-publish.mjs --dry-run`
names every one it would pack.

### What stays private, and why

- **`@meith/worker`** (`apps/worker`): no [board-config seam](./architecture.md#the-board-config-seam)
  import in its source, so it needs no per-installation customization, and
  `create-meith`'s scaffold does not depend on it. The tick runs through the
  worker process or `meith task:run`; neither needs `@meith/worker` on the
  registry.
- **`@meith/site`** (`apps/web`): meith.dev itself.
- **`@meith/board-stock`** (`boards/stock`): the workspace `docker/Dockerfile`
  builds the official image from (see [the stock board](./architecture.md)).
  A board, not a library, so private like `apps/community`; the version
  lockstep still applies to it.
- **`@meith/testkit`**: it drags `@meith/db` and `@meith/drivers` behind it,
  and that closure is most of the board.
- **The examples**: `hello-plugin` and `iris-theme` are documentation,
  copied rather than installed, and their `definePlugin` versions are
  deliberately their own rather than the release's.

### How packages are packed and published

`scripts/npm-publish.mjs` is the mechanism. Dependencies before dependents,
where a dependency is a `dependencies`, `peerDependencies` or
`optionalDependencies` edge, so a workspace-internal peer orders and holds
back like a plain dependency. A version already on the registry is skipped.
Each package is packed by `pnpm`, which rewrites the `workspace:` ranges into
real ones, and published by the `npm` CLI, which implements trusted
publishing.

**Every tarball is checked against its own manifest before anything is
published**: every non-excluded entry in `files` must have put something in
the tarball, and every `bin` target must be a real file in it. Under
`@meith/web`, `app/` and `public/` are the two to watch: nothing exercises
either except a board built from the published tarball, and a `public/` left
out of the allowlist costs web push its service worker without failing
anything in this repository.

`--dry-run` stops at the packing and the tarball check and never reaches the
registry, which is what lets a pull request run it: the tree between releases
carries a version that is already published, so `npm publish --dry-run`
would refuse every package.

CI's `static` job runs the dry run on every push and pull request
(`.github/workflows/ci.yml`), building `create-meith`'s `dist` first;
release.yml's `npm` job orders the same two steps the same way, since only
`pnpm build` writes `dist/bin.mjs`. That is the only packing coverage for a
package outside the `board-workspace` job's closure, so `files` or `bin` rot
in a theme or a domain package fails on the pull request rather than
mid-release.

### The set is closed

A published package may not depend on a private one; that would be an
`npm install` that resolves for nobody. `release-check` enforces the closure
across `dependencies`, `peerDependencies` and `optionalDependencies` alike.
Publishing a package means deleting its `private: true`, and the check then
names everything that drags with it. That is how `@meith/core` and
`@meith/ui` entered the set: the kits and themes stand on them.

Dependency ranges between published packages are `workspace:^`, so a published
manifest says `^X.Y.Z`. A plugin published at 0.1.0 accepts every 0.1 patch
of the kits and refuses 0.2, the same promise the image tags make.

### The npm surface is a compatibility commitment

"Install this version of the board alongside this version of a theme or
plugin" is governed by the same policy that backs `apiVersion` for themes
and plugins ([theme API versioning](./themes.md#versioning),
[plugin API versioning](./plugins.md#versioning)): a minor may add
capability, only a major may remove or rename it, and a package built against
one major keeps working against every release on that major.

`@meith/web`, `@meith/cli` and `@meith/theme-default` are not exempt from [the
version policy](#the-version-policy). A scaffolded board pins all three to an
exact version: the scaffold upgrades by `npx create-meith@latest update`,
which runs `npm install --save-exact @meith/web@latest @meith/cli@latest
@meith/theme-default@latest` plus the deploy-file rewrite. That is an
explicit act, or an explicitly merged pull request from the scaffold's
update workflow, never a silent range resolution on a board process holding
a database migration. The scaffolded `.npmrc` sets `save-exact=true` so the
same holds for an install run by hand, and the generated `build.yml` refuses
to build from anything but an exact version.

A theme or plugin's `workspace:^` on the kits is the same policy as a version
range; a theme or plugin upgrade runs no migrations, so the risk is lower.

### They ship TypeScript source

A theme or plugin is only ever consumed inside a board's Next build, which
compiles these packages **from source** wherever they come from: the
workspace today (`transpilePackages` in the board's Next config, Tailwind's
`@source` scan for class names), npm tomorrow. So the published tarball is the
`src/` directory the monorepo tests, minus the test files. There is no dist
step, so the published artifact cannot drift from what CI exercised.

Two consequences bind whoever wires an npm-installed package into a board
build:

- the package's name must be in the board's `transpilePackages`; a workspace
  package is compiled because it lives outside `node_modules`, an npm one is
  not;
- a theme or plugin needs a Tailwind `@source` entry for its `node_modules`
  path, or its class names are silently dropped from the stylesheet and its
  pages render unstyled with no error anywhere.

The one exception is `create-meith`: its published `bin` runs under plain
`node`, invoked by `npx`, never inside a board's Next build. Node's native
TypeScript support refuses to strip types for a file under `node_modules`
(`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), which is where npm installs
a package before running its bin, so a `bin` entry pointing at raw `.ts`
fails for every real `npx create-meith`. `create-meith`'s own `pnpm build`
(esbuild, bundling `src/bin.ts` to `dist/bin.mjs`) is the one dist step in
the published set, and the release workflow's `npm` job runs it immediately
before `node scripts/npm-publish.mjs`.

### How the workflow authenticates

**Trusted publishing, not a token.** Each package on npmjs.com names this
repository and the `release.yml` workflow as its trusted publisher. npm
exchanges the job's OIDC identity for a short-lived credential scoped to that
publish, and provenance is generated automatically. There is no long-lived
secret to leak, rotate, or scope too widely. Two consequences:

- **Configuration lives on npmjs.com, per package**: package → Settings →
  Trusted Publisher → GitHub Actions, with the organisation (`meith-dev`),
  repository (`meith`) and workflow filename (`release.yml`). Renaming the
  workflow file breaks publishing, with an authentication error at the npm
  job, until every one of those configurations is updated.
- **A brand-new package cannot first-publish this way**, because trusted
  publishing attaches to a package that already exists. A name the registry
  has never seen is skipped with a notice, and the rest of the release goes
  out.

## Deploy template repositories

Two deploy routes start from a repository the operator clones rather than from
this one: **[meith-dev/template](https://github.com/meith-dev/template)** is the
"Use this template" repository behind the self-host guides (Coolify and
Docker Compose both), and
**[meith-dev/vercel-template](https://github.com/meith-dev/vercel-template)** is
what the Vercel Deploy Button clones. Their contents are generated:
`templates/self-host/` and `templates/vercel/` here are the source of truth,
written by `pnpm templates:gen` from `create-meith`'s `scaffold()` and held
current by `pnpm templates:gen:check` (part of `pnpm verify`).

The `publish-templates` job in `release.yml` mirrors each committed tree into
its repository on every release: it clones the repository, makes its tracked
tree match `templates/<target>/` exactly, adding, updating and **deleting**,
commits `chore(release): sync template to vX.Y.Z` when anything changed, and
tags the repository `vX.Y.Z`. It runs after `publish`, so a release that did
not ship never pushes a template, and a re-run with nothing to change makes
no commit.

`npx create-meith@latest update` fetches the `vX.Y.Z` tag of the version a
board is *on* to tell the operator's edits from files the scaffold wrote: a
file still matching that tree is the scaffold's to rewrite, one that differs
is the operator's to keep
([Upgrading § Upgrading each deployment route](../operating/upgrading.md#upgrading-each-deployment-route)).
A release whose template sync did not run leaves the *next* update degraded:
`package.json` still moves, but every other file is handed back to the
operator to review. The repository names are one constant,
`TEMPLATE_REPOSITORIES` in `packages/create-meith/src/update.ts`, which both
the mirror and the updater read.

The tracked content of each repository is **owned entirely** by its
`templates/<target>/` source; anything the source does not contain, the mirror
removes. A file a repository needs, such as a `LICENSE`, belongs in the
scaffold, never added to the repository by hand. `pnpm templates:sync:check`
verifies in CI that the repositories still match the generated trees.

**The push credential.** `GITHUB_TOKEN` grants write to this repository only, so
the cross-repository push authenticates as a **GitHub App**, which does not
expire. Create an organisation-owned App with the **Contents: read and
write** and **Workflows: read and write** repository permissions: the mirror
includes `.github/workflows/build.yml`, and GitHub rejects an App push that
touches `.github/workflows/` without the Workflows permission. Install it on
`meith-dev/template` and `meith-dev/vercel-template`, approving the Workflows
permission on the installation if you add it later, and store its **App ID**
and a generated **private key** as the Actions secrets
`TEMPLATE_SYNC_APP_ID` and `TEMPLATE_SYNC_APP_PRIVATE_KEY` here. The
`publish-templates` job mints a short-lived installation token from them on
each run (`actions/create-github-app-token`, scoped to those two
repositories) and hands it to `templates:sync` as `TEMPLATE_SYNC_TOKEN`.
Without the App configured the job logs a warning and does nothing, so
releases still succeed. The repositories are created once, up front, with
`meith-dev/template` marked as a *template repository* in its settings so the
"Use this template" button appears.

## How each route consumes a release

| Route | What it tracks | How an upgrade arrives |
|---|---|---|
| [Deploying with Coolify](../setting-up/deployment/coolify.md), a scaffolded board | The operator's own repository, `main` branch, whose `package.json` pins `@meith/web`, `@meith/cli` and `@meith/theme-default` exact. On the quick-start path Coolify builds `Dockerfile` and `docker-compose.yaml` from that repository on every Redeploy; on the prebuilt path `MEITH_IMAGE` names `ghcr.io/<you>/my-board`, either `:latest`, which follows the board's own `main`, or a commit-sha tag, which never moves. | The board's `.github/workflows/update.yml` opens a pull request on its weekly run, or `npx create-meith@latest update` by hand; merging or pushing it and pressing **Redeploy** deploys it. Never from a push to this repository's `main`, and never from the `release` branch. |
| A template or [by-hand](../setting-up/deployment/docker-compose.md) board ([Upgrading](../operating/upgrading.md#upgrading-each-deployment-route)) | Its own `package.json`, pinned exact | The same update workflow or `npx create-meith@latest update`, then `docker compose up -d --build`. Either moves the pins and the scaffold-owned deploy files together; the backup and `meith upgrade` stay the operator's. |
| meith.dev and demo.meith.dev | `main` | The project's own resources, deliberately ahead of any release: the demo shows what is coming, and both redeploy on push. Nobody self-hosting should copy this arrangement. |

### Deploys are deterministic

No deploy path resolves "the newest anything". A scaffolded board's
`package.json` names exact versions and its `Dockerfile.prebuilt` starts
`FROM` an exact `meith-base` tag, so a version change always has a commit in
the board's own repository behind it. `docker/compose.coolify.yml`, the
stock-image compose file that CI's `compose` job still boots, names an exact
image the same way; `MEITH_IMAGE` in the resource's environment overrides the
file's default so a Coolify **Restart** or **Redeploy** re-creates exactly
that version. The same variable takes a digest.

The base images, `node`, `postgres`, `valkey`, `alpine` and `curl`, are
pinned by digest in the Dockerfiles and compose files, and every action in
the workflows is pinned to a full commit SHA with the version tag kept as a
comment: the workflows hold publish rights, and a re-tagged action is code
they would run. Dependabot moves all of these pins on the same weekly schedule
as the npm dependencies.

The `docker` and `docker-compose` ecosystems in `.github/dependabot.yml` are
scoped to `docker/`, so a digest written by hand anywhere else never moves.
Where something outside `docker/` needs one of these images, it *reads* the
pinned value: `scripts/board-eject-smoke.mts` takes the `psql` client it
shells out to from `docker/compose.yml`'s `postgres` service, through
`pinnedComposeImage` (`scripts/compose-images.mts`).

The throwaway Postgres that GitHub Actions starts as a job's `services:`
container is the deliberate exception and stays on the bare
`postgres:18-alpine` tag: no Dependabot ecosystem reads a workflow's
`services:` block, so a digest there would rot in place. A bare tag in a
Dockerfile, a compose file, or a script that reads one is a bug.

## One-time setup

### The deploy key the cut workflow pushes with

The cut workflow pushes straight to `main`, and a ruleset requiring pull
requests blocks that (`GH013`, at the push step, before anything is tagged).
Rulesets cannot grant bypass to the built-in Actions app, so the workflow
pushes over SSH with a **deploy key**, which rulesets can bypass. The key
also solves a second problem: a tag pushed with `GITHUB_TOKEN` triggers no
workflows, GitHub's recursion guard, while a deploy-key push starts the
Release workflow the ordinary way.

1. `ssh-keygen -t ed25519 -f meith-release -N ""`, anywhere; delete both
   files once the two halves are stored.
2. **Settings → Deploy keys → Add deploy key**: the public half
   (`meith-release.pub`), with **Allow write access** ticked.
3. **Settings → Secrets and variables → Actions → New repository secret**:
   `RELEASE_DEPLOY_KEY`, the private half, the whole file including header
   and footer.
4. **Settings → Rules → Rulesets → the rule on `main` → Bypass list → add
   "Deploy keys"**.

The protection still applies to people and to every app. The workflow is
safe to re-run after a failure at any step: a tree already bumped, a commit
already pushed, or a tag already made is skipped rather than refused.

### The first release

One-time steps around `v0.1.0`, in order:

1. Tag and push; the workflow publishes the image and creates the `release`
   branch by pushing it.
2. **Make the GHCR package public.** The first push creates
   `ghcr.io/meith-dev/meith` private, and a private package fails at
   `docker pull` with an authentication error no operator can act on.
   Package settings → change visibility → public.
3. **Create the npm organisation, and publish each package by hand once.** The
   `meith` organisation owns the `@meith` scope, and a package's very first
   publish is made from a maintainer's own machine.
   [A package's first publish](#a-packages-first-publish) is the procedure.
4. Protect the `release` branch from manual pushes, so the workflow's
   fast-forward is the only thing that moves it.

### A package's first publish

npm has no way to name a trusted publisher for a package that does not exist
yet ([npm/cli#8544](https://github.com/npm/cli/issues/8544) is the open
request), so a first publish comes from a person, once. Substitute the
directory and name:

```sh
npm login
cd themes/clubhouse
pnpm pack --out /tmp/pack.tgz
npm publish /tmp/pack.tgz --access public
npm trust github @meith/theme-clubhouse \
  --repo meith-dev/meith --file release.yml --allow-publish
```

Each line is load-bearing:

- **`npm login`, not a token.** Creating a package should carry 2FA, and a
  CI token cannot answer a 2FA prompt. The only token that publishes
  unattended is one marked *bypass 2FA*, a long-lived secret with the run of
  the whole scope.
- **`pnpm pack`, not `npm publish .`.** pnpm rewrites the `workspace:` ranges
  into real ones. A manifest published with `workspace:^` still in it is an
  `npm install` that resolves for nobody.
- **`npm trust`** configures the trusted publisher from the terminal, the
  same thing as the package's settings page on npmjs.com. It needs npm 12 or
  newer. Without it the package publishes this once and then fails every
  release after, at authentication.

Do this **before** tagging and the release publishes the package like any
other. Do it after and the package is one release behind; re-running the
Release workflow against the tag catches it up, since a run publishes whatever
is missing and skips whatever is already there. A package that depends on a
skipped one is held back too, and the job says so; publishing the new package
by hand and re-running the workflow clears both.
