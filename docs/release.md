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
| `ghcr.io/meith-dev/meith:X.Y.Z` | The board image — web, worker, migrator and operator CLI in one, `linux/amd64` and `linux/arm64`. This tag never moves again. |
| `ghcr.io/meith-dev/meith:X.Y` | The **release line**: re-published by every patch of the line. This is the tag the Coolify compose file pins. |
| `ghcr.io/meith-dev/meith:latest` | The newest release, whatever line it is on. For trying the image, never for deploying it. |
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
- The dependency version `create-meith` writes into a scaffolded project.
- The image line the Coolify compose file pins.

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

The patch rule is a promise, not a habit. The Coolify compose file pins the
release line and re-pulls it on every deploy, so **Redeploy** on a quickstart
board silently picks up the newest patch — that button is only safe because a
patch never carries a migration. A fix that needs a migration is a minor
release, whatever its size.

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
   manifests, the two constants, `create-meith`), move the compose pin if the
   line is changing, and let `pnpm verify` — which includes `release:check` —
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
   - the `release` branch is fast-forwarded to the tag — refused if the tag
     is not descended from it, which is the guard against tagging a side
     branch;
   - the GitHub Release is drafted.
5. **Finish the draft.** Fill in the migration line, trim the generated notes
   to what an operator needs, publish.

## How each route consumes a release

| Route | What it tracks | How an upgrade arrives |
|---|---|---|
| [Quickstart](./quickstart.md) (Coolify) | The `release` branch; the compose pin on the `X.Y` line | **Redeploy** pulls the newest patch of the line. A new minor arrives when a release moves the pin on the `release` branch — never from a push to `main`. |
| [By hand](./self-hosting.md) (Compose) | A release tag in a clone | `git fetch --tags && git checkout vX.Y.Z`, rebuild. Building from source is the point of this route; the published image is the alternative for small machines. |
| meith.dev and demo.meith.dev | `main` | The project's own resources, deliberately ahead of any release: the demo shows what is coming, and both redeploy on push. Nobody self-hosting should copy this arrangement. |

## The first release

One-time steps around `v0.1.0`, in order:

1. Tag and push `v0.1.0`; the workflow publishes the image and creates the
   `release` branch by pushing it.
2. **Make the GHCR package public.** The first push creates
   `ghcr.io/meith-dev/meith` private, and a private package is a quickstart
   that fails at `docker pull` with an authentication error no operator can
   act on. Package settings → change visibility → public.
3. **Register the npm names** — the `@meith` scope and the `create-meith`
   name — even though nothing publishes yet. The names appear throughout this
   repository and its documentation; unregistered, they are anybody's to take.
4. Protect the `release` branch from manual pushes, so the workflow's
   fast-forward is the only thing that moves it.

## The npm packages are a later milestone, on purpose

`create-meith` scaffolds a project that installs `@meith/web`, `@meith/cli`
and `@meith/theme-default` from npm, and plugin and theme authors would
eventually add `@meith/plugin-kit` and `@meith/theme-kit` the same way. None
of that is published at 0.1.0, and every package stays `private: true`.

This is sequencing rather than reluctance. Today every package's entry point
is its TypeScript source, which only a workspace build can consume; the kits
pull `@meith/core` and its neighbours behind them; and there is no `forum-web`
binary for a scaffolded project's scripts to run. Publishing now would ship
packages that `npm install` accepts and nothing can build — a worse first
impression than their absence, and plugin and theme development already works
in a checkout ([Development](./development.md)), versioned by the same tag as
everything else.

Publishing becomes part of the release act when all four exist:

1. **Built output** for the publish set — compiled JS, declaration files and
   `exports` maps, not source entry points.
2. **The `forum-web` bin**, so a scaffolded project's `dev`, `build` and
   `start` scripts run.
3. **An end-to-end gate in CI**: scaffold with `create-meith` against the
   packed tarballs, install, build, boot. The same standard the image meets —
   nothing is published that CI has not consumed the way a user would.
4. **Trusted publishing** from the release workflow (OIDC, provenance on), so
   no long-lived npm token exists to leak.

Until then, a release is the image, the tag, the branch and the notes — and
`release-check` keeps the unpublished versions honest so that flipping the
switch is one release's work, not an archaeology project.
