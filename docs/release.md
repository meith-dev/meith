# Releasing

How a version of Meith is cut, what each release publishes, and the policy that
decides what a version number may contain. This is the maintainer's document —
the operator's side of the same story is [Upgrading a board](./upgrading.md).

## What a release is

A release is a git tag `vX.Y.Z` on a commit of `main` that CI has passed.
Pushing the tag runs `.github/workflows/release.yml`, and everything a release
publishes comes out of that one act:

| Artifact | What it is |
|---|---|
| `ghcr.io/meith-dev/meith:X.Y.Z` | The board image — web, worker, migrator and operator CLI in one, `linux/amd64` and `linux/arm64`. This tag never moves again, and it is the only tag anything deploys: the Coolify compose file pins it exactly. |
| `ghcr.io/meith-dev/meith:X.Y` | The release line, floating over its patches. A convenience for trying the image; nothing this repository ships deploys a floating tag. |
| `ghcr.io/meith-dev/meith:latest` | The newest release, whatever line it is on. Same status: for trying, never for deploying. |
| The `@meith` packages on npm | The theme and plugin kits, the first-party themes and plugins, and their dependency closure — ten packages at the release version, published with provenance. See [what publishes to npm](#what-publishes-to-npm). |
| The `release` branch | Fast-forwarded to the tag. The Quickstart points Coolify at this branch, so a board deployed by the guide follows releases and never sees `main` mid-cycle. |
| A GitHub Release | Drafted by the workflow with generated notes and a header the maintainer must finish — see [the notes](#the-notes-say-which-kind-of-upgrade-this-is). |

No tag is ever re-pointed and no image tag except `X.Y` and `latest` is ever
re-pushed. A release that turns out to be broken gets a new patch release,
which is cheaper than every operator on earth wondering which `v0.1.2` they
have.

## One version, everywhere

The workspace releases in lockstep: the root `package.json` version is the
release version, and every workspace manifest carries the same one. The
packages are one tree at one commit — tested together, shipped together — and
per-package versions would claim an independence none of them has.

The version is also written down in places npm never reads:

- `CODE_VERSION` in `apps/cli/src/upgrade.ts` — what `community upgrade`
  records in the database.
- `CODE_VERSION` in `apps/community/src/server/upgrade-notice.ts` — what the
  admin panel compares the recorded version against.
- The version `packages/create-meith/src/bin.ts` writes into the dependencies
  of a scaffolded project.
- The `version` each first-party plugin declares to `definePlugin`
  (`plugins/dues`, `plugins/reference`) — what `/admin/plugins` renders, and
  the only one of these an operator ever sees.
- The exact image tag the Coolify compose file pins.

Nothing fails at runtime if these drift, but the plugin one is not silent: it
sat at `0.1.0` through two releases while the manifest beside it moved, so a
board that had just upgraded cleanly displayed a plugin version two releases
old and read as a deploy that had not landed. So the agreement is enforced
textually: `pnpm release:check` fails on any of them naming a different
version, it runs in `pnpm verify` and CI, and the release workflow runs it
with `--tag` so a tag that disagrees with its tree is refused before anything
is built.

The image additionally carries the version as `MEITH_VERSION` (an environment
variable and OCI labels, stamped by the workflow). A local `docker build`
leaves it at `0.0.0-dev`, so a boot log always says whether a container came
from a release or a checkout — the entrypoint prints it.

## The version policy

Semantic versioning, with the boundaries drawn by **migrations** rather than
by API surface, because a schema change is the one thing an operator cannot
shrug off:

| Bump | May contain | May migrate? |
|---|---|---|
| **Patch** | Fixes only | **Never.** |
| **Minor** | Features, new settings, new migrations | Yes — additive by strong preference. |
| **Major** | Removals, renames, destructive backfills | Yes, including the kind that needs the two-step deploy. |

The patch rule is a promise, not a habit: it is what makes "take the patch
now, without ceremony" always the right advice, however many patches a board
is behind. A fix that needs a migration is a minor release, whatever its
size.

Two other rules already live in the code and bind releases:

- **Upgrades span at most two majors** (`packages/upgrade`). Every major must
  keep its migrations correct against schemas up to two majors back, and that
  is the claim releases are tested against.
- **Downgrades are refused.** There is no down migration; recovery is by
  restore. Nothing in the release process may assume otherwise.

## The notes say which kind of upgrade this is

[Upgrading a board](./upgrading.md#when-the-deploy-and-the-migration-are-separate-events)
promises operators that "releases say which kind they are". The workflow
drafts every release with a **Migrations:** line the maintainer must complete —
*none*, *adds only*, or *removes or renames* — before publishing. A release
published with the placeholder still in it is a broken promise, which is why
the workflow drafts rather than publishes.

## How a release happens

1. **Make sure `main` is green.** The release pipeline re-runs the boot
   tests, not the whole gate; the gate is `main`'s job.
2. **Run the Cut a release workflow** — Actions → *Cut a release* → the
   version, `major.minor.patch` with no leading `v`. It bumps every place
   the version is written (`pnpm release:bump` — the manifests, the source
   constants, the plugin manifests, the compose pin), proves coherence with
   `release-check --tag`, commits `chore(release): vX.Y.Z` to `main`, pushes
   the tag, and starts the Release workflow against it. A version that would
   not move the tree forward is refused before anything is written.

   The same thing by hand, when the Actions tab is not an option:

   ```sh
   pnpm release:bump 0.2.0
   pnpm install --lockfile-only && pnpm release:check
   git commit -am "chore(release): v0.2.0" && git push
   git tag v0.2.0 && git push origin v0.2.0
   ```

   Either way, the bump lands on `main` *before* the tag — tagging a tree
   that still says the old version is exactly what `release-check --tag`
   exists to refuse.

3. **The Release workflow does the rest**, in this order, stopping at the
   first failure:
   - `release-check --tag` — the tag and the tree agree;
   - the image is built **on each architecture's own runner** (no emulation)
     and booted in every role against a real Postgres — the migrator runs to
     completion, the web role serves and renders, the worker survives a tick
     and registers its tasks — on both architectures;
   - only then are the two pushed and merged under `X.Y.Z`, `X.Y` and
     `latest`;
   - the npm packages are published, dependencies first — a re-run skips
     whatever already reached the registry, so a half-failed publish resumes
     rather than starts over, and a package the registry refuses holds back
     only the packages that depend on it, not everything ordered behind it;
   - the `release` branch is fast-forwarded to the tag — refused if the tag
     is not descended from it, which is the guard against tagging a side
     branch;
   - the GitHub Release is drafted.
4. **Finish the draft.** Fill in the migration line, trim the generated notes
   to what an operator needs, publish.

### The deploy key the cut workflow pushes with

The cut workflow pushes straight to `main`, and a ruleset requiring pull
requests blocks that (`GH013`, at the push step, with nothing yet tagged).
Rulesets can never grant bypass to the built-in Actions app — it does not
appear in the bypass list — so the workflow pushes over SSH with a
**deploy key** instead, which rulesets *can* bypass. It also solves a second
problem at the same time: a tag pushed with `GITHUB_TOKEN` triggers no
workflows (GitHub's recursion guard), while a deploy-key push starts the
Release workflow the ordinary way.

One-time setup:

1. `ssh-keygen -t ed25519 -f meith-release -N ""` — anywhere, then delete
   both files once the two halves are stored.
2. **Settings → Deploy keys → Add deploy key**: the public half
   (`meith-release.pub`), with **Allow write access** ticked.
3. **Settings → Secrets and variables → Actions → New repository secret**:
   `RELEASE_DEPLOY_KEY`, the private half (the whole file, header and
   footer included).
4. **Settings → Rules → Rulesets → the rule on `main` → Bypass list → add
   "Deploy keys"**.

The protection keeps applying to people and to every app; the one thing
allowed through is a key that exists only as this repository's secret, used
only by this workflow, and revocable in one click. The workflow itself is
safe to re-run after a failure at any step: a tree already bumped, a commit
already pushed, or a tag already made is skipped rather than refused.

## How each route consumes a release

| Route | What it tracks | How an upgrade arrives |
|---|---|---|
| [Quickstart](./quickstart.md) (Coolify) | The `release` branch; the compose pin on the exact version | Every release moves the pin, so an upgrade is a **Redeploy** after the branch moves — or automatic, with the webhook on. Never from a push to `main`, and never from a restart. |
| [By hand](./self-hosting.md) (Compose) | A release tag in a clone | `git fetch --tags && git checkout vX.Y.Z`, rebuild. Building from source is the point of this route; the published image is the alternative for small machines. |
| meith.dev and demo.meith.dev | `main` | The project's own resources, deliberately ahead of any release: the demo shows what is coming, and both redeploy on push. Nobody self-hosting should copy this arrangement. |

### Deploys are deterministic, and that is load-bearing

The compose file names an exact, immutable version, so every path that
creates a container — the first deploy, a **Redeploy**, a server reboot, a
crash restart, an environment edit — produces the same board. No deploy path
resolves "the newest anything": a version change always has a commit on the
`release` branch behind it, which is what makes "what is this board running,
and since when" answerable from git history rather than from whatever the
registry held at the moment somebody pressed a button. It is also what keeps
a bad release contained — a board that has not deployed the new pin is not
running it, and holding back is simply not redeploying yet.

An operator who wants a stronger pin than a tag — a digest, immune even to a
re-pushed tag — or who needs to hold a version while the branch moves on, can
set `MEITH_IMAGE` on the resource's environment in Coolify; it overrides the
file's default. The exact tags are never re-pushed, so this is belt and
braces rather than a need.

## The first release

One-time steps around `v0.1.0`, in order:

1. Tag and push `v0.1.0`; the workflow publishes the image and creates the
   `release` branch by pushing it.
2. **Make the GHCR package public.** The first push creates
   `ghcr.io/meith-dev/meith` private, and a private package is a quickstart
   that fails at `docker pull` with an authentication error no operator can
   act on. Package settings → change visibility → public.
3. **Create the npm organisation, and bootstrap the packages with a token.**
   The `meith` organisation owns the `@meith` scope. A package's very first
   publish needs a granular automation token (in the repository's `NPM_TOKEN`
   secret, deleted afterwards); from then on the workflow authenticates with
   **trusted publishing** and no token exists to leak — see
   [how the workflow authenticates](#how-the-workflow-authenticates).
4. Protect the `release` branch from manual pushes, so the workflow's
   fast-forward is the only thing that moves it.

## What publishes to npm

Every workspace package that is **not** `private: true` publishes on every
release, at the release version. Ten at 0.1.0:

| | Packages |
|---|---|
| The kits | `@meith/plugin-kit`, `@meith/theme-kit` — what a plugin or theme author writes against |
| Their closure | `@meith/core`, `@meith/ui` |
| The themes | `@meith/theme-default`, `@meith/theme-midnight`, `@meith/theme-phasebook`, `@meith/theme-raidframe`, `@meith/theme-clubhouse` |
| The plugins | `@meith/plugin-dues`, `@meith/plugin-reference` |

`scripts/npm-publish.mjs` is the mechanism: dependencies before dependents, a
version already on the registry skipped rather than failed, and `--dry-run`
packs everything locally so the tarballs can be read before a release ever
runs. Each package is packed by `pnpm` — which rewrites the `workspace:`
ranges into real ones — and published by the `npm` CLI, which is what
implements trusted publishing.

### How the workflow authenticates

**Trusted publishing, not a token.** Each package on npmjs.com names this
repository and the `release.yml` workflow as its trusted publisher; when the
release workflow runs, npm exchanges the job's OIDC identity for a
short-lived credential scoped to that publish, and provenance is generated
with it automatically. There is no long-lived secret to leak, rotate, or
scope too widely — a package can only be published by this repository's
release workflow, and npmjs.com shows exactly that on the package page.

Two consequences worth knowing:

- **Configuration lives on npmjs.com, per package**: package → Settings →
  Trusted Publisher → GitHub Actions, with the organisation (`meith-dev`),
  repository (`meith`) and workflow filename (`release.yml`). Renaming the
  workflow file breaks publishing until the ten configurations are updated
  to match — the failure is a clear authentication error at the `npm` job.
- **A brand-new package cannot first-publish this way**, because trusted
  publishing attaches to a package that exists. The publish script handles
  the birth itself: a name the registry has never seen is published with the
  `NPM_BOOTSTRAP_TOKEN` secret — a granular token allowed to create packages
  in the scope — confined to that single publish, while everything
  already-known keeps authenticating by OIDC in the same run. The job then
  says, loudly, to give the newborn its trusted publisher on npmjs.com;
  until that is done, the *next* release of that package fails at
  authentication, because only its first publish takes the token path.
  Without the secret set, the script names the package and both ways forward
  — set the token, or publish it once by hand.

  What the bootstrap token has to be, because npm answers a refusal with the
  same `404` it uses for "no such package" and the difference is invisible
  from the log: **granular** (classic tokens no longer publish at all),
  unexpired, owned by someone who may create packages in the `meith`
  organisation, and scoped under *Packages and scopes* to the **whole
  `@meith` scope** with read and write. A token limited to selected packages
  authenticates perfectly and still cannot create a name that does not exist
  yet, which is what a first publish is. The script reports which of these it
  is by asking the registry who the token is: no identity means expired or
  revoked, an identity means the token's reach is what to widen.

  The by-hand way out, when the token is the slow thing to fix — packed by
  `pnpm`, because a manifest still carrying `workspace:` ranges is an
  `npm install` that resolves for nobody:

  ```sh
  npm login   # so the publish carries 2FA
  cd themes/clubhouse
  pnpm pack --out /tmp/pack.tgz && npm publish /tmp/pack.tgz --access public
  ```

  Then re-run the release workflow against the tag; the newborn is an
  ordinary package by then, and the run skips everything already published.

### They carry the release version, not their own

Every package publishes at the release version, including ones the release
did not touch. That is a choice against independent per-package versioning,
and the reason is what these packages *are*: none of them is independent
software. The kits re-export the board's own contracts, the themes and
plugins are compiled into the board's build, and CI only ever tests one
combination — the tree at the tag. Lockstep makes the npm version state
exactly what was tested: `@meith/theme-phasebook@0.1.4` is the theme as board
0.1.4 shipped it, and "board 0.1.4 with theme 0.1.2" is a mismatch anyone can
see without a lookup table. Independent versions would replace that with a
compatibility matrix nobody tests — a permanent documentation debt bought to
avoid republishing a few small tarballs.

The cost is that a version bump does not mean the package changed; the
release notes carry that information, as they do for every lockstep monorepo
on npm (Angular, Jest, the AWS SDK). A plugin's *schema* has its own version
besides — the one in its `definePlugin` manifest, which migrations are
recorded against — so "did this plugin's data model change" is already
answered by a number that only moves when it did.

The decision is revisited the day something genuinely standalone joins the
set — a package with its own audience and lifecycle earns its own version
line then. Going from lockstep to independent later is versions diverging
from a shared point; the reverse is a renumbering nobody downstream enjoys,
which is why lockstep is the right place to start.

### They ship TypeScript source, deliberately

A theme or plugin is only ever consumed inside a board's Next build, and that
build compiles these packages **from source** wherever they come from — the
workspace today (`transpilePackages` in the board's Next config, Tailwind's
`@source` scan for class names), npm tomorrow. So the published tarball is the
`src/` directory the monorepo tests, byte for byte, minus the test files.
There is no dist step, which means there is no way for the published artifact
to drift from what CI exercised — the failure mode a compiled copy would
invent.

Two consequences bind whoever wires an npm-installed package into a board
build, and they are the same two the monorepo already handles for the
first-party set:

- the package's name must be in the board's `transpilePackages` — a workspace
  package is compiled because it lives outside `node_modules`, an npm one is
  not;
- a theme or plugin needs a Tailwind `@source` entry for its `node_modules`
  path, or its class names are silently dropped from the stylesheet and the
  pages render unstyled with no error anywhere.

### The set is closed, and closing it is the cost of publishing

A published package may not depend on a private one — that is an
`npm install` that resolves for nobody. `release-check` enforces the closure:
publishing a package is deleting its `private: true`, and the check then names
everything that decision drags with it. That is how `@meith/core` and
`@meith/ui` entered the set — the kits and themes stand on them — and it is
the friction that keeps the set deliberate.

Dependency ranges between published packages are `workspace:^`, so a
published manifest says `^X.Y.Z` — the release line again. A plugin published
at 0.1.0 accepts every 0.1 patch of the kits and refuses 0.2, which is the
same compatibility promise the image tags make.

### What stays private, still

- **The board itself** — `@meith/web` and `@meith/cli`. A
  board-as-a-dependency flow would need a real bin for a consuming project's
  scripts to run and an end-to-end CI gate (install from packed tarballs,
  build, boot) before publishing it is honest. The kits going out first is
  what lets plugin and theme authors start now, in a checkout or against npm
  types, while that question waits.
- **`@meith/testkit`** — it drags `@meith/db` and `@meith/drivers` behind it,
  and that closure is most of the board.
- **The examples** — `hello-plugin` and `iris-theme` are documentation. They
  are copied, not installed.
