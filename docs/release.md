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
| The `@meith` packages on npm | The theme and plugin kits, the first-party themes and plugins, and their dependency closure — nine packages at the release version, published with provenance. See [what publishes to npm](#what-publishes-to-npm). |
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
- The exact image tag the Coolify compose file pins.

Nothing fails at runtime if these drift; a board would simply record one
version while the release notes named another. So the agreement is enforced
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

1. **Land the release commit on `main`.** Bump every version together (the
   manifests, the two constants, the compose pin — the pin moves on every
   release), and let `pnpm verify` — which includes `release:check` —
   prove nothing was missed.
2. **Wait for CI on that commit.** The release workflow re-runs the boot
   tests, not the whole gate; the gate is `main`'s job.
3. **Tag it:**

   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```

4. **The workflow does the rest**, in this order, stopping at the first
   failure:
   - `release-check --tag` — the tag and the tree agree;
   - the image is built **on each architecture's own runner** (no emulation)
     and booted in every role against a real Postgres — the migrator runs to
     completion, the web role serves and renders, the worker survives a tick
     and registers its tasks — on both architectures;
   - only then are the two pushed and merged under `X.Y.Z`, `X.Y` and
     `latest`;
   - the npm packages are published, dependencies first — a re-run skips
     whatever already reached the registry, so a half-failed publish resumes
     rather than starts over;
   - the `release` branch is fast-forwarded to the tag — refused if the tag
     is not descended from it, which is the guard against tagging a side
     branch;
   - the GitHub Release is drafted.
5. **Finish the draft.** Fill in the migration line, trim the generated notes
   to what an operator needs, publish.

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
3. **Create the npm organisation and the token.** The `meith` organisation
   owns the `@meith` scope; a granular automation token allowed to publish it
   goes into the repository's `NPM_TOKEN` secret. After the first release,
   configure npm **trusted publishing** for each package and drop the token —
   the workflow already requests the OIDC permission that provenance uses.
4. Protect the `release` branch from manual pushes, so the workflow's
   fast-forward is the only thing that moves it.

## What publishes to npm

Every workspace package that is **not** `private: true` publishes on every
release, at the release version. Nine at 0.1.0:

| | Packages |
|---|---|
| The kits | `@meith/plugin-kit`, `@meith/theme-kit` — what a plugin or theme author writes against |
| Their closure | `@meith/core`, `@meith/ui` |
| The themes | `@meith/theme-default`, `@meith/theme-midnight`, `@meith/theme-phasebook` |
| The plugins | `@meith/plugin-dues`, `@meith/plugin-reference` |

`scripts/npm-publish.mjs` is the mechanism: dependencies before dependents, a
version already on the registry skipped rather than failed, and `--dry-run`
packs everything locally so the tarballs can be read before a release ever
runs.

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
