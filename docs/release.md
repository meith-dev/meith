# Releasing

How a version of Meith is cut, what each release publishes, and the policy
that decides what a version number may contain. This is the maintainer's
document; the operator's side of the same story is
[Upgrading a board](./upgrading.md).

## What a release is

A release is a git tag `vX.Y.Z` on a commit of `main` that CI has passed.
Pushing the tag runs `.github/workflows/release.yml`, and everything a
release publishes comes out of that one act:

| Artifact | What it is |
|---|---|
| `ghcr.io/meith-dev/meith:X.Y.Z` | The board image — web, worker, migrator and operator CLI in one, for `linux/amd64` and `linux/arm64`. This tag never moves again, and it is the only tag anything deploys: the Coolify compose file pins it exactly. |
| `ghcr.io/meith-dev/meith:X.Y` | The release line, floating over its patches. A convenience for trying the image; nothing this repository ships deploys a floating tag. |
| `ghcr.io/meith-dev/meith:latest` | The newest release, whatever line it is on. Same status: for trying, never for deploying. |
| `ghcr.io/meith-dev/meith-base:X.Y.Z` | The framework base image a scaffolded custom board's own Dockerfile starts `FROM` — the `@meith/web`/`@meith/cli`/`@meith/theme-default` dependency closure, version-locked to this release, no board config and no secret (`docker/Dockerfile.base`). No floating tag: a board pins it exactly, the same way it pins the npm packages below. See [Self-hosting § Custom boards](./self-hosting.md#custom-boards). |
| The `@meith` packages on npm | The board itself (`@meith/web`, `@meith/cli`), the theme and plugin kits, the first-party themes and plugins, `create-meith`, and all of their dependency closures — fifty packages at the release version, published with provenance. See [what publishes to npm](#what-publishes-to-npm). |
| The `release` branch | Fast-forwarded to the tag. The Quickstart points Coolify at this branch, so a board deployed by the guide follows releases and never sees `main` mid-cycle. |
| A GitHub Release | Drafted by the workflow with generated notes and a header the maintainer must finish — see [the release notes](#the-notes-say-which-kind-of-upgrade-this-is). |

No tag is ever re-pointed, and no image tag except `X.Y` and `latest` is
ever re-pushed. A release that turns out to be broken gets a new patch
release — cheaper than every operator wondering which `v0.1.2` they have.

## One version, everywhere

The workspace releases in lockstep: the root `package.json` version is the
release version, and every workspace manifest carries the same one. The
packages are one tree at one commit — tested together, shipped together —
and per-package versions would claim an independence none of them has.

The version is also written in places npm never reads:

- `CODE_VERSION` in `apps/cli/src/upgrade.ts` — what `community upgrade`
  records in the database.
- `CODE_VERSION` in `apps/community/src/server/upgrade-notice.ts` — what
  the admin panel compares the recorded version against.
- The version `packages/create-meith/src/bin.ts` writes into a scaffolded
  project's dependencies.
- `MEITH_VERSION` in `packages/marketplace/src/build-info.ts` — this
  board's own version, checked against a listing's `meith` compatibility
  range.
- The `version` each first-party plugin declares to `definePlugin`
  (`plugins/dues`, `plugins/reference`) — what `/admin/plugins` shows, and
  the only one of these an operator ever sees.
- The exact image tag the Coolify compose file pins.

Nothing fails at runtime if these drift, but the drift is visible: the
plugin version once sat at `0.1.0` through two releases, so a board that
had just upgraded cleanly displayed a plugin two releases old. So the
agreement is enforced textually: `pnpm release:check` fails when any of
them names a different version, it runs in `pnpm verify` and CI, and the
release workflow runs it with `--tag` so a tag that disagrees with its tree
is refused before anything is built.

One more file carries the version, and it is generated rather than
checked: `docs/openapi.json` stamps the release version as its
`info.version`. It is not a `release-check` constant — a stale value is
caught by `pnpm api:docs:check` instead — so `pnpm release:bump`
regenerates it (via `pnpm api:docs`) in the same run that moves the
version, and the release commit carries the fresh document. Before that,
a bump left the schema at the previous version and CI failed at
`api:docs:check` on the release commit.

The image additionally carries the version as `MEITH_VERSION` (an
environment variable and OCI labels, stamped by the workflow). A local
`docker build` leaves it at `0.0.0-dev`, and the entrypoint prints it at
boot — so a container's log always says whether it came from a release or
a checkout.

## The version policy

Semantic versioning, with the boundaries drawn by **migrations** rather
than API surface, because a schema change is the one thing an operator
cannot shrug off:

| Bump | May contain | May migrate? |
|---|---|---|
| **Patch** | Fixes only | **Never.** |
| **Minor** | Features, new settings, new migrations | Yes — additive by strong preference. |
| **Major** | Removals, renames, destructive backfills | Yes, including the kind that needs a two-step deploy. |

The patch rule is a promise: it is what makes "take the patch now, without
ceremony" always the right advice, however many patches a board is behind.
A fix that needs a migration is a minor release, whatever its size. (This
is maintainer policy — no gate compares a version bump against the
migrations directory — so it is a promise to keep, not a check to lean
on.)

Two other rules live in the code and bind releases:

- **Upgrades span at most two majors** (`packages/upgrade`). Every major
  must keep its migrations correct against schemas up to two majors back,
  and that is the claim releases are tested against.
- **Downgrades are refused.** There is no down migration; recovery is by
  restore. Nothing in the release process may assume otherwise.

## The notes say which kind of upgrade this is

[Upgrading a board](./upgrading.md#when-the-deploy-and-the-migration-are-separate-events)
promises operators that releases say which kind they are. The workflow
drafts every release with a **Migrations:** line the maintainer must
complete — *none*, *adds only*, or *removes or renames* — before
publishing. A release published with the placeholder still in it is a
broken promise, which is why the workflow drafts rather than publishes.

## How a release happens

1. **Make sure `main` is green.** The release pipeline re-runs the boot
   tests, not the whole gate; the gate is `main`'s job.
2. **Run the "Cut a release" workflow** — Actions → *Cut a release* → the
   version, `major.minor.patch` with no leading `v`. It bumps every place
   the version is written (`pnpm release:bump` — the manifests, the source
   constants, the plugin manifests, the compose pin) and regenerates the
   one document that stamps the version, `docs/openapi.json`, proves
   coherence with `release-check --tag`, commits `chore(release): vX.Y.Z`
   to `main`, pushes the tag, and thereby starts the Release workflow. A
   version that would not move the tree forward is refused before anything
   is written.

   The same thing by hand, when the Actions tab is not an option:

   ```sh
   pnpm release:bump 0.7.0
   pnpm install --lockfile-only && pnpm release:check
   git commit -am "chore(release): v0.7.0" && git push
   git tag v0.7.0 && git push origin v0.7.0
   ```

   Either way the bump lands on `main` *before* the tag — tagging a tree
   that still says the old version is exactly what `release-check --tag`
   exists to refuse.

3. **The Release workflow does the rest**, in order, stopping at the first
   failure:
   - `release-check --tag` — the tag and the tree agree;
   - the image is built **on each architecture's own runner** (no
     emulation) and booted in every role against a real Postgres — the
     migrator runs to completion, the web role serves and renders, the
     worker survives a tick and registers its tasks — on both
     architectures;
   - only then are the two images pushed and merged under `X.Y.Z`, `X.Y`
     and `latest`;
   - the npm packages are published, dependencies first. A re-run skips
     whatever already reached the registry, so a half-failed publish
     resumes rather than starts over; a name the registry has never seen
     is skipped with a notice, because only a person can make a first
     publish ([below](#a-packages-first-publish));
   - `ghcr.io/meith-dev/meith-base` is built and pushed, one architecture
     per runner like the board image above, then merged under the exact
     version — no floating tag. It `npm install`s the just-published
     `@meith/web`, `@meith/cli` and `@meith/theme-default` from the real
     registry, so it runs after the npm job and fails the same way that job
     does if one of those three was skipped as new-to-the-registry; re-run
     the workflow once it is published by hand, same as everywhere else in
     this pipeline;
   - the `release` branch is fast-forwarded to the tag — refused if the
     tag is not descended from it, which is the guard against tagging a
     side branch;
   - the GitHub Release is drafted.
4. **Finish the draft.** Fill in the migration line, trim the generated
   notes to what an operator needs, publish.

### The deploy key the cut workflow pushes with

The cut workflow pushes straight to `main`, and a ruleset requiring pull
requests blocks that (`GH013`, at the push step, before anything is
tagged). Rulesets cannot grant bypass to the built-in Actions app, so the
workflow pushes over SSH with a **deploy key** instead, which rulesets
*can* bypass. The key solves a second problem at the same time: a tag
pushed with `GITHUB_TOKEN` triggers no workflows (GitHub's recursion
guard), while a deploy-key push starts the Release workflow the ordinary
way.

One-time setup:

1. `ssh-keygen -t ed25519 -f meith-release -N ""` — anywhere; delete both
   files once the two halves are stored.
2. **Settings → Deploy keys → Add deploy key**: the public half
   (`meith-release.pub`), with **Allow write access** ticked.
3. **Settings → Secrets and variables → Actions → New repository secret**:
   `RELEASE_DEPLOY_KEY`, the private half (the whole file, header and
   footer included).
4. **Settings → Rules → Rulesets → the rule on `main` → Bypass list → add
   "Deploy keys"**.

The protection keeps applying to people and to every app; the one thing
allowed through is a key that exists only as this repository's secret,
used only by this workflow, revocable in one click. The workflow is safe
to re-run after a failure at any step: a tree already bumped, a commit
already pushed, or a tag already made is skipped rather than refused.

## How each route consumes a release

| Route | What it tracks | How an upgrade arrives |
|---|---|---|
| [Quickstart](./quickstart.md) (Coolify) | The `release` branch; the compose pin on the exact version, held per resource by `MEITH_IMAGE` | Every release moves the pin, so an upgrade is a **Redeploy** after the branch moves — or automatic, with the webhook on. Never from a push to `main`. Coolify's **Restart** re-runs the deployment from the branch head, so unpinned it upgrades too — the Quickstart has the operator pin `MEITH_IMAGE` so it cannot. |
| [By hand](./self-hosting.md) (Compose) | A release tag in a clone | `git fetch --tags && git checkout vX.Y.Z`, rebuild. Building from source is the point of that route; the published image is the alternative for small machines. |
| meith.dev and demo.meith.dev | `main` | The project's own resources, deliberately ahead of any release: the demo shows what is coming, and both redeploy on push. Nobody self-hosting should copy this arrangement. |

### Deploys are deterministic, and that is load-bearing

The compose file names an exact, immutable version. No deploy path
resolves "the newest anything": a version change always has a commit on
the `release` branch behind it, which is what makes "what is this board
running, and since when" answerable from git history. It also keeps a bad
release contained — a board that has not deployed the new pin is not
running it.

The determinism is per *commit*, though, not by itself per resource:
Coolify re-reads the compose file from the branch head on every deploy
action, and on a compose resource that includes the panel's **Restart**
button, which re-runs the deployment rather than restarting containers.
A crash or a reboot re-creates the running version; a button in the
panel deploys whatever release the branch has moved to. What makes a
*resource* deterministic is `MEITH_IMAGE` in its environment: it
overrides the file's default, so Restart and Redeploy re-create exactly
that version — which is why the Quickstart tells the operator to set it,
and why holding back from a release is simply not moving it yet. The
same variable serves the operator who wants a stronger pin than a tag: a
digest, immune even to a re-pushed tag.

The same reasoning runs through the rest of the pipeline. The base images
— `node`, `postgres`, `valkey`, `alpine`, `curl` — are pinned by digest
in the Dockerfiles and compose files, not by tag alone, and every action
in the workflows is pinned to a full commit SHA with the version tag kept
as a comment: the workflows hold publish rights, and a re-tagged action
is code they would run. Dependabot moves all of these pins on the same
weekly schedule as the npm dependencies, so the pinning costs review, not
staleness.

## The first release

One-time steps around `v0.1.0`, in order:

1. Tag and push; the workflow publishes the image and creates the
   `release` branch by pushing it.
2. **Make the GHCR package public.** The first push creates
   `ghcr.io/meith-dev/meith` private, and a private package is a
   quickstart that fails at `docker pull` with an authentication error no
   operator can act on. Package settings → change visibility → public.
3. **Create the npm organisation, and publish each package by hand
   once.** The `meith` organisation owns the `@meith` scope, and a
   package's very first publish is made from a maintainer's own machine —
   the workflow cannot make one. [A package's first
   publish](#a-packages-first-publish) is the procedure; from then on the
   workflow authenticates with trusted publishing and no token exists to
   leak.
4. Protect the `release` branch from manual pushes, so the workflow's
   fast-forward is the only thing that moves it.

## What publishes to npm

Every workspace package that is **not** `private: true` publishes on every
release, at the release version. Fifty today, `pnpm release:check`'s own
count of "packages publish to npm" is the number to trust as this grows —
this table is a snapshot, not the source of truth:

| | Packages |
|---|---|
| The board | `@meith/web`, `@meith/cli` — the Next.js app and the operator CLI. Each carries a bin (`forum-web`, `community`) that materializes its sources into an external workspace and points the [board-config seam](./architecture.md#the-board-config-seam) at that workspace's own files — see [Consuming the board from a workspace](./development.md#consuming-the-board-from-a-workspace). Without these two on npm, `create-meith`'s scaffold would depend on a package that does not exist. |
| The kits | `@meith/plugin-kit`, `@meith/theme-kit` — what a plugin or theme author writes against |
| The board's dependency closure | `@meith/accounts`, `@meith/admin`, `@meith/antispam`, `@meith/api`, `@meith/attachments`, `@meith/authorization`, `@meith/avatars`, `@meith/core`, `@meith/db`, `@meith/demo`, `@meith/drafts`, `@meith/drivers`, `@meith/events`, `@meith/forums`, `@meith/groups`, `@meith/i18n`, `@meith/import`, `@meith/install`, `@meith/mail`, `@meith/markdown`, `@meith/marketplace`, `@meith/messages`, `@meith/moderation`, `@meith/notifications`, `@meith/polls`, `@meith/posts`, `@meith/profile-fields`, `@meith/relations`, `@meith/reputation`, `@meith/runtime`, `@meith/search`, `@meith/settings`, `@meith/signatures`, `@meith/subscriptions`, `@meith/tasks`, `@meith/threads`, `@meith/ui`, `@meith/upgrade` — every domain and infrastructure package `@meith/web` or `@meith/cli` names in its own `dependencies`, transitively. None of these is independently useful; each is here only because the board (or a theme in its closure) imports it. |
| The themes | `@meith/theme-default`, `@meith/theme-midnight`, `@meith/theme-phasebook`, `@meith/theme-raidframe`, `@meith/theme-clubhouse` |
| The plugins | `@meith/plugin-dues`, `@meith/plugin-reference` |
| The initializer | `create-meith` — `npx create-meith` scaffolds a board whose `package.json` depends on `@meith/web`, `@meith/cli` and `@meith/theme-default`. An npx-able initializer that is not itself on npm does not exist. |

**The worker does not publish, and is not part of this.** `apps/worker`
(`@meith/worker`) has no [board-config seam](./architecture.md#the-board-config-seam)
import anywhere in its source — it needs no per-installation customization
the way the web app and CLI do — and `create-meith`'s scaffold does not
depend on it: something has to run the tick every minute (the worker
process, or `community task:run`), but nothing about running it requires
`@meith/worker` to exist on the registry. Giving it a bin for a scaffolded
workspace, the way `forum-web` and `community` have one, is orthogonal
follow-up work — see [Consuming the board from a
workspace](./development.md#consuming-the-board-from-a-workspace).

`scripts/npm-publish.mjs` is the mechanism: dependencies before
dependents, a version already on the registry skipped rather than failed,
and `--dry-run` packs everything locally — every tarball is also checked
against its own manifest before anything would be published: every
non-excluded entry in `files` must have put something in the tarball, and
every `bin` target must be a real file in it. That is what catches, before
a release ever runs, the failure mode a bare version bump cannot: a
`files` allowlist that still names a directory nothing is written into any
more (the Next app directory, `app/`, under `@meith/web`, is the one worth
being paranoid about — nothing exercises it externally except a board
actually built from the published tarball). Each package is packed by
`pnpm` — which rewrites the `workspace:` ranges into real ones — and
published by the `npm` CLI, which is what implements trusted publishing.

### The npm surface is a compatibility commitment

Publishing `@meith/web` and `@meith/cli` makes "install this version of
the board, alongside this version of a theme or plugin" a real question
with a real answer for the first time — until now that pairing only ever
existed inside this monorepo, at one commit. It is governed by the same
policy that already backs `apiVersion` for themes and plugins
([theme API versioning](./theme-api.md#versioning),
[plugin API versioning](./plugin-api.md#versioning)): a minor may add
capability, only a major may remove or rename it, and a package built
against one major keeps working against every release on that major.
`@meith/web` and `@meith/cli` are not exempt from [the version
policy](#the-version-policy) just because they are new to npm — a
scaffolded board pins them to an exact version rather than a range
(deliberately: `create-meith`'s scaffold upgrades by `npm install
@meith/web@latest @meith/cli@latest`, an explicit act, never a silent
range resolution on a board process holding a database migration), while a
theme or plugin's `workspace:^` on `@meith/theme-kit` / `@meith/plugin-kit`
is the same policy stated as a version range instead. Same guarantee,
different mechanism for the different risk: a board upgrade runs
migrations, a theme or plugin upgrade does not.

### How the workflow authenticates

**Trusted publishing, not a token.** Each package on npmjs.com names this
repository and the `release.yml` workflow as its trusted publisher. When
the release workflow runs, npm exchanges the job's OIDC identity for a
short-lived credential scoped to that publish, and provenance is generated
automatically. There is no long-lived secret to leak, rotate, or scope too
widely — a package can only be published by this repository's release
workflow, and npmjs.com shows exactly that on the package page.

Two consequences worth knowing:

- **Configuration lives on npmjs.com, per package**: package → Settings →
  Trusted Publisher → GitHub Actions, with the organisation (`meith-dev`),
  repository (`meith`) and workflow filename (`release.yml`). Renaming the
  workflow file breaks publishing until every one of those configurations
  is updated; the failure is a clear authentication error at the npm job.
- **A brand-new package cannot first-publish this way**, because trusted
  publishing attaches to a package that already exists. The release does
  not attempt it: a name the registry has never seen is skipped with a
  notice, and the rest of the release goes out.

### A package's first publish

npm has no way to name a trusted publisher for a package that does not
exist yet ([npm/cli#8544](https://github.com/npm/cli/issues/8544) is the
open request), so a first publish comes from a person, once, and every
release after it is ordinary OIDC. The shape of it — substitute the
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

- **`npm login`, not a token.** Creating a package is exactly the act
  that should carry 2FA, and a CI token cannot answer a 2FA prompt — the
  only token that publishes unattended is one marked *bypass 2FA*, which
  is a long-lived secret with the run of the whole scope, the thing this
  arrangement exists to avoid.
- **`pnpm pack`, not `npm publish .`.** pnpm rewrites the `workspace:`
  ranges into real ones. A manifest published with `workspace:^` still in
  it is an `npm install` that resolves for nobody.
- **`npm trust`** configures the trusted publisher from the terminal —
  the same thing as the package's settings page on npmjs.com. It needs
  npm 12 or newer. Without it the package publishes this once and then
  fails every release after, at authentication.

Do this **before** tagging and the release publishes the package like any
other. Do it after and the package is one release behind — re-running the
Release workflow against the tag catches it up, since a run publishes
whatever is missing and skips whatever is already there. A package that
*depends* on a skipped one is held back too, and the job says so;
publishing the new package by hand and re-running the workflow clears
both together.

### They carry the release version, not their own

Every package publishes at the release version, including ones the
release did not touch. That is a choice against per-package versioning,
and the reason is what these packages are: none of them is independent
software. The kits re-export the board's own contracts, the themes and
plugins are compiled into the board's build, and CI only ever tests one
combination — the tree at the tag. Lockstep makes the npm version state
exactly what was tested: `@meith/theme-phasebook@0.1.4` is the theme as
board 0.1.4 shipped it, and "board 0.1.4 with theme 0.1.2" is a mismatch
anyone can see without a lookup table.

The cost is that a version bump does not mean the package changed; the
release notes carry that information, as they do for every lockstep
monorepo on npm (Angular, Jest, the AWS SDK). A plugin's *schema* has its
own version besides — the one in its `definePlugin` manifest, which
migrations are recorded against — so "did this plugin's data model
change" is already answered by a number that only moves when it did.

The decision gets revisited the day something genuinely standalone joins
the set. Going from lockstep to independent later is versions diverging
from a shared point; the reverse is a renumbering nobody downstream
enjoys, which is why lockstep is the right place to start.

### They ship TypeScript source, deliberately

A theme or plugin is only ever consumed inside a board's Next build, and
that build compiles these packages **from source** wherever they come from
— the workspace today (`transpilePackages` in the board's Next config,
Tailwind's `@source` scan for class names), npm tomorrow. So the published
tarball is the `src/` directory the monorepo tests, byte for byte, minus
the test files. There is no dist step, which means there is no way for the
published artifact to drift from what CI exercised.

Two consequences bind whoever wires an npm-installed package into a board
build — the same two the monorepo already handles for the first-party
set:

- the package's name must be in the board's `transpilePackages` — a
  workspace package is compiled because it lives outside `node_modules`;
  an npm one is not;
- a theme or plugin needs a Tailwind `@source` entry for its
  `node_modules` path, or its class names are silently dropped from the
  stylesheet and its pages render unstyled with no error anywhere.

### The set is closed, and closing it is the cost of publishing

A published package may not depend on a private one — that would be an
`npm install` that resolves for nobody. `release-check` enforces the
closure: publishing a package means deleting its `private: true`, and the
check then names everything that decision drags with it. That is how
`@meith/core` and `@meith/ui` entered the set — the kits and themes stand
on them — and it is the friction that keeps the set deliberate.

Dependency ranges between published packages are `workspace:^`, so a
published manifest says `^X.Y.Z` — the release line again. A plugin
published at 0.1.0 accepts every 0.1 patch of the kits and refuses 0.2,
the same compatibility promise the image tags make.

### What stays private, still

- **`@meith/worker`** (`apps/worker`) — see [above](#what-publishes-to-npm):
  no board-config seam, no bin, no dependant in `create-meith`'s scaffold.
- **`@meith/site`** (`apps/web`) — meith.dev itself. It is the project's own
  marketing site, not part of what an operator installs.
- **`boards/stock`** — the workspace `docker/Dockerfile` builds the official
  image from (see docs/architecture.md, "The stock board"). It is a board,
  not a library, so it stays private the same way `apps/community` does; the
  version lockstep above still applies to it, like every workspace manifest.
- **`@meith/testkit`** — it drags `@meith/db` and `@meith/drivers` behind
  it, and that closure is most of the board.
- **The examples** — `hello-plugin` and `iris-theme` are documentation.
  They are copied, not installed.
