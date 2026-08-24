# The marketplace

A curated, reviewed feed of the plugins and themes worth pointing a board
at — `marketplace/` in this repository, published at
[meith.dev/marketplace/v1.json](https://www.meith.dev/marketplace/v1.json).

It is metadata only. **Nothing is fetched through this feed.** Installing
a plugin or theme is still `pnpm add`, a line in `community.plugins.ts` or
your theme selection, and a redeploy — the same procedure described in
[the plugin API](./plugin-api.md#writing-a-plugin) and
[the theme API](./theme-api.md). The feed exists so a board operator can
find out what is available and whether it is worth their trust before they
do any of that; it has no way to make the board do it for them.

## What is in a listing

Each file in `marketplace/listings/` is one entry, validated against
`marketplace/schema.json`. This shape, not any one listing's actual
values:

```json
{
  "key": "dues",
  "kind": "plugin",
  "package": "@meith/plugin-dues",
  "name": "Dues",
  "description": "Paid memberships through Stripe.",
  "screenshots": ["dues-light.png"],
  "version": "1.0.0",
  "apiVersion": 1,
  "meith": ">=1.0 <3",
  "repository": "https://github.com/meith-dev/meith",
  "licence": "LGPL-3.0-or-later"
}
```

These fields are the whole of it — a listing carries nothing else. Adding
a field is a decision for a maintainer to sign off on, not something a
pull request adding a listing should do on its own; `scripts/marketplace-gen.mjs`
refuses a file with an extra property for exactly that reason.

- **`key`** follows the same rule `definePlugin` applies to a plugin's own
  key — lower-case letters, digits and hyphens, starting with a letter.
- **`version` is the *listed package's* own version**, not this
  repository's release version. This is the one place the workspace's
  lockstep versioning does not apply — a third-party plugin releases on
  its own schedule, and the feed has to be able to say so. A first-party
  listing (Dues, the five bundled themes) still tracks the release,
  because it ships inside this repository and there is only one version
  of it to name.
- **`apiVersion`** is the plugin-kit or theme-kit major the listing was
  built against, and **`meith`** is a version range naming which board
  line it has been checked to run on — comparators (`>=`, `<=`, `>`, `<`,
  `=`) against a numeric version, space-separated to mean AND. Neither is
  resolved against anything at generation time; they are declarations the
  generator checks *parse*, not claims it verifies are true.
- **`screenshots`** are filenames only, resolved against
  `marketplace/screenshots/`. **The feed never references a third-party
  host.** The generator copies each file into the site's own public
  assets, so a screenshot the feed points at is a screenshot meith.dev
  itself serves.

## The generator

```sh
pnpm marketplace:gen          # validates and writes the feed
pnpm marketplace:gen:check    # validates and fails if the feed is stale
```

`pnpm verify` runs the check. It fails, naming the file and the field, on
a `kind` that is not `plugin` or `theme`, a `version` or `meith` range that
does not parse, a `key` that would not pass `definePlugin` either, a
screenshot the array names that does not exist under
`marketplace/screenshots/`, or two listings claiming the same `key` or
`package`. It also fails, separately, if the listings changed and nobody
ran `pnpm marketplace:gen` to update the published feed — the same
discipline as [the other generated documents](./development.md#the-generated-documents).

The output is deterministic: listings are sorted by `key` regardless of
directory order, and nothing in it is time-stamped, so running the
generator twice with unchanged listings produces byte-identical output.

The merged feed lands at `apps/web/public/marketplace/v1.json` — Next.js
serves anything under a site's `public/` directory at the matching path,
the same way `apps/web/public/shots` becomes the images on meith.dev's own
pages — and the screenshots land beside it at
`apps/web/public/marketplace/screenshots/`. Both are committed, exactly
like `docs/openapi.json`: a generated file `pnpm verify` checks for
staleness rather than a build step that produces it fresh.

## The feed URL is a contract

`/marketplace/v1.json` is versioned in its path on purpose. A board built
against today's shape can keep reading it after the shape changes,
because that change ships as `/marketplace/v2.json` alongside it rather
than in place of it.

## The board-side consumer: the Browse tab

`marketplace.feed_url` is a board setting (**Settings → Marketplace**),
defaulting to the URL above, so a self-hosted mirror serving the same
shape works as a drop-in replacement. **The board fetches it, never the
member's or the operator's browser** — a `marketplace.refresh_catalog`
task (`packages/tasks`) fetches, validates against the same shape this
document describes, and caches the result once a day; the **Refresh**
button on **Admin → Plugins → Browse** and **Admin → Themes → Browse**
runs the identical pass on demand (`refreshCatalog` in
`packages/marketplace`, called by both the task and the admin action —
one implementation, not two). A board with no outbound network fails the
fetch quietly — logged, not alarmed — and the Browse tab falls back to
the installed list plus a plain note that the catalog could not be
loaded; whatever it last fetched successfully keeps showing.

Each listing's status is computed against what this build actually
contains — `Active`, `Installed — disabled`, `Not installed`, `Update
available`, or `Incompatible` (its `apiVersion` or `meith` range fails
against this build) — never against what installing it would do. An
incompatible listing never gets install steps; a **Not installed** one
gets the exact `community plugin:add <package>` (or `pnpm add` plus a
`community.config.ts` line, for a theme) this board would need, and a
link to this document — not a button that pretends to act, because nothing
here installs anything.

Screenshots are proxied through the board's own `/admin/api/marketplace/screenshot`
route rather than linked to the feed's host directly, so a member's — or
an operator's — browser never makes a request to meith.dev or a mirror on
its own. When the daily fetch finds a newer, compatible version of an
installed plugin, administrators are notified through the board's own
notification system (`marketplace.update_available`, a staff-audience
kind next to `system.task_failed`) once per (plugin, version) ever —
independent of whether that notification has since been read, which a
bare dedupe key on the notification service is not.

See [The organiser's guide § When to hand it to somebody
technical](./organiser-guide.md#when-to-hand-it-to-somebody-technical) for
the operator-facing walkthrough.

## Moving to a custom board

The stock image is fixed at the version it was built at — nothing can be
installed into a running container, which is exactly why a **Not
installed** listing on a stock board's Browse tab links here rather than
offering an install button. Because the stock image is itself built from
a workspace shaped like [`create-meith`](./development.md#the-workspace)'s
own scaffold (see [Self-hosting § Custom
boards](./self-hosting.md#custom-boards)), graduating to one is generating
those same files from *this build's own state* and repointing the deploy
— the database is untouched, because the board's identity lives in
Postgres, not in the image.

Three steps, nothing beyond a browser, a GitHub account and the server
you already run.

### 1. Eject

Run this inside the stock image, the same way every other operator
command runs (see [Operating a board § The operator
CLI](./operating.md#the-operator-cli)):

```sh
docker compose run --rm web community board:eject /data/my-board
```

`/data/my-board` becomes a complete workspace: `package.json` pinned to
*this image's exact release version* — never `latest`, so graduating is
never a surprise upgrade — the full deploy kit (`Dockerfile`,
`docker-compose.yml`, `.github/workflows/build.yml`, described in full in
[Self-hosting § Custom boards](./self-hosting.md#custom-boards)),
`board.plugins.json` matching what this build actually compiled in, and
`community.config.ts` matching the stock configuration. Every plugin the
manifest names is also added to `package.json`'s own `dependencies`, at
that same exact version, so the ejected workspace's first build can
actually resolve the imports `community.plugins.ts` writes for it — a
manifest package `create-meith`'s scaffold already pins (`@meith/web`,
`@meith/cli`, `@meith/theme-default`) is left exactly where it is rather
than duplicated. It refuses to write into a directory that already exists
and is not empty, the same as `create-meith` itself.

### 2. Push it to GitHub

`/data/my-board` is a plain directory, not a git repository yet:

```sh
cd /data/my-board
git init && git add -A && git commit -m "Graduate from the stock image"
```

Push it to a new, empty repository on GitHub. No local Docker toolchain
needed from here — `.github/workflows/build.yml`, already written, builds
the image on GitHub's own runners the first time this repository's `main`
branch is pushed to.

### 3. Point Coolify at it and redeploy

From here it is the same three-step deploy [Self-hosting § Custom
boards](./self-hosting.md#custom-boards) describes for any scaffolded
board: make the GitHub package public (it starts private), point Coolify
at the new repository — it finds `docker-compose.yml` on its own — and
set `MEITH_IMAGE` to the image step 2 just pushed, then redeploy.

### What does not move

- **The database.** `board:eject` never touches it — the same Postgres,
  the same connection string, before and after.
- **Uploads.** Wherever the `uploads` volume already points, it keeps
  pointing there.
- **Every environment variable** — `AUTH_SECRET`, `TICK_SECRET`,
  `DATABASE_URL`, mail settings, all of it. Only where the image comes
  from changes.

Once the redeploy is live, the board is an ordinary workspace: installing
the plugin that started this is `pnpm add` and a line in
`community.plugins.ts`, the same as [the plugin API](./plugin-api.md#writing-a-plugin)
describes, followed by a commit, a push, and the same redeploy.

## Listing by pull request

There is no submission form. A listing is a pull request against this
repository adding one file to `marketplace/listings/` and its screenshot
to `marketplace/screenshots/` — the same route [HACS](https://hacs.xyz)
uses for its default repository, and for the same reason: a human reviews
it before it is reachable by anyone.

### The review bar

Before a listing is merged, a maintainer checks:

- **The licence is compatible.** Readable by anyone installing it,
  compatible with this project's own LGPL-3.0-or-later, and truthfully
  named in the `licence` field.
- **The code has actually been read.** Not compiled, not run — read. What
  it imports, what it sends over the network, and whether its migrations
  stay inside its own `plugin_<key>_*` namespace as
  [the plugin API](./plugin-api.md#the-namespace-is-enforced-where-it-can-be)
  requires.
- **No network call beyond what the listing describes.** A dues-style
  plugin talking to a payment processor is expected; the same plugin
  phoning home to an analytics endpoint nobody asked for is not, and is
  grounds for refusal on its own.

None of this is automated, and none of it is enforced by `plugin-kit` or
`theme-kit` at install time. It is editorial judgement, applied once, by
whoever merges the pull request.

## The honest trust statement

**The feed lists. It does not sandbox.** Nothing about appearing here
changes what a plugin or theme can do once it is running — every boundary
in [the plugin API](./plugin-api.md#what-a-plugin-cannot-do) and every
constraint on a theme in [the theme API](./theme-api.md) applies exactly
the same to a listed package as to one you wrote yourself. Being listed is
a statement that the code was reviewed once, at a point in time, by a
maintainer who read it — not a guarantee about the version you actually
install, not a promise it was reviewed again on its last update, and not
a sandbox that would catch something the review missed.

Installing anything, listed or not, is the operator extending trust to
that code through their own build. This document does not change that;
it only tries to make the decision an informed one.

## Delisting

A listing is removed — its file deleted from `marketplace/listings/`, its
screenshot from `marketplace/screenshots/`, `pnpm marketplace:gen` run
again — when:

- it stops meeting the review bar above, on a later look;
- the package is unpublished, abandoned, or its repository is gone;
- a maintainer is told about a real problem — a vulnerability, undisclosed
  network calls, a licence that turns out not to be what the listing
  claimed — and confirms it.

Removal is silent to any board already running the package: it stops
appearing in `/marketplace/v1.json` on the next publish, and nothing
reaches out to a board that installed it while it was listed. A board
that wants to know whether a plugin it runs is still listed has to check
the feed itself.

## What is seeded today

Six first-party listings: **Dues** and the five themes described in
[Development](./development.md#the-workspace) — default, midnight,
phasebook, raidframe and clubhouse. Their `version` and `licence` fields
are read from each package's own `package.json`, and `pnpm release:check`
enforces the `version` field directly: for every listing whose `package`
names a workspace package, the listing's `version` must equal that
package's manifest version, the same lockstep [the release
process](./release.md#one-version-everywhere) holds every other published
package to. `pnpm release:bump` moves the six listings and runs `pnpm
marketplace:gen` in the same pass, so a release always lands with a feed
that already matches them. A third-party listing's `package` does not
resolve to a workspace package, so the check leaves it alone — it tracks
its own release, as [above](#what-is-in-a-listing) explains.

**Their screenshots are placeholders** — a small solid-colour PNG per
listing, generated rather than captured, standing in until real marketing
screenshots exist. Nothing about them claims to show the product; they
exist so the feed's screenshot pipeline (validate, copy, publish) has real
files to prove itself against. Replacing one is the same pull request as
any other listing update: a new PNG in `marketplace/screenshots/`, the
filename changed in the listing, `pnpm marketplace:gen`.
