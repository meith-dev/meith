# The marketplace

A curated, reviewed feed of the plugins and themes worth pointing a board
at — `marketplace/` in this repository, published at
[meith.dev/marketplace/v1.json](https://www.meith.dev/marketplace/v1.json).

It is metadata only. **Nothing is fetched through this feed.** Installing
a plugin or theme is still `pnpm add`, a line in `community.plugins.ts` or
your theme selection, and a redeploy — the same procedure described in
[the plugin API](./plugins.md#writing-a-plugin) and
[the theme API](./themes.md). The feed exists so a board operator can
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
  "licence": "MIT"
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
discipline as [the other generated documents](../contributing/development.md#the-generated-documents).

The output is deterministic: listings are sorted by `key` — by UTF-16 code
point, not `String.localeCompare`, whose result follows the machine's own
`LANG`/ICU collation and disagrees across machines on `[a-z0-9-]` strings
— regardless of directory order, and nothing in it is time-stamped, so
running the generator twice with unchanged listings produces
byte-identical output on any machine, not only the one that generated it.

The merged feed lands at `apps/web/public/marketplace/v1.json` — Next.js
serves anything under a site's `public/` directory at the matching path,
the same way `apps/web/public/shots` becomes the images on meith.dev's own
pages — and the screenshots land beside it at
`apps/web/public/marketplace/screenshots/`. Both are committed, exactly
like `docs/reference/openapi.json`: a generated file `pnpm verify` checks for
staleness rather than a build step that produces it fresh.

The generator also verifies that these are the *only* files in play. Every
screenshot actually present under `marketplace/screenshots/` must be
referenced by some current listing's `screenshots` field, and every file
under `apps/web/public/marketplace/` must be either the feed file or a
referenced screenshot — nothing else. `pnpm marketplace:gen:check` fails,
naming the file, on anything that does not fit that shape: a screenshot a
deleted or renamed listing left behind, or a file dropped straight into
the published directory rather than added as a reviewed listing.
`pnpm marketplace:gen` deletes such orphans on both sides rather than
leaving them for a human to notice — which is also why deleting a
listing's screenshot from `marketplace/screenshots/` before running the
generator, as [Delisting](#delisting) already asked for, does the right
thing either way. Each screenshot is also checked as a file, not just as a
name: its first 8 bytes must be a real PNG signature, and it must be under
5,000,000 bytes — the same ceiling the screenshot proxy route applies to a
screenshot fetched from a self-hosted mirror — so a `*.png` filename with
some other payload behind it never reaches meith.dev's public assets.

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

The daily task and an admin's **Refresh** click can land on the same
newly-seen version at the same moment, so "once ever" is enforced by
claiming the (plugin, version) marker atomically before the notification
is raised, not by checking it and writing it back afterwards — a
`PostgresMarketplaceCacheRepository.claimNotified` call is a single
`UPDATE ... WHERE NOT (already claimed)` against the one
`marketplace_catalog` row, so a second, concurrent caller either blocks
behind the row lock and then sees the marker already there, or loses the
`WHERE` race outright; either way it reports the claim as already taken
and `refreshCatalog` skips the notification. The marker is written before
the notification is raised, on purpose: if raising the notification then
throws, this build has claimed a (plugin, version) it never actually
announced, and will not retry it — a missed notice, not a duplicate one.
That is the accepted failure mode, because the Browse tab's status badge
is computed fresh from the cached feed on every read, independent of the
notified-marker set; a missed notification is recoverable by the operator
simply visiting Browse, where a duplicate notification for the same
version, ever, is the one thing this system promises not to do.

See [The organiser's guide § When to hand it to somebody
technical](../guides/community/organiser-guide.md#when-to-hand-it-to-somebody-technical) for
the operator-facing walkthrough.

### Outbound fetches do not follow redirects

Both places the board fetches an untrusted host — the daily/on-demand
catalog fetch (`packages/marketplace/src/fetch.ts`) and the screenshot
proxy route (`apps/community/app/admin/api/marketplace/screenshot/route.ts`)
— pass `redirect: 'manual'` and treat any non-2xx response, a redirect
included, as a failed fetch, exactly like an unreachable host or a 503.
Per-listing screenshot paths are already constrained to the feed's own
origin (they are validated as site-relative and resolved against it, not
trusted as full URLs), but the feed host itself is an admin-configured
address (see below) that could answer with a `302` to a link-local or
RFC1918 target; left unhandled, the screenshot proxy would follow it and
stream whatever answered back to the admin's browser, and the daily fetch
would follow it too before its own shape validation caught the mismatch —
usable either way as a reachability or timing probe into a network the
feed host itself cannot otherwise reach. Refusing to follow closes that
without changing how a redirect-free feed or screenshot host behaves.

Both fetches also refuse to buffer a hostile body whole before enforcing
their size cap. A `Content-Length` over the cap is rejected before any
read begins; otherwise the body is read through `readCappedBody`
(`packages/marketplace/src/fetch.ts`, exported for the screenshot route to
share), which walks the response stream chunk by chunk and cancels it the
moment the running total passes the cap, rather than accumulating the
whole thing first. The existing 10-second abort timeout is unchanged.

### The feed URL is an admin-trusted setting

`marketplace.feed_url` (validated by `isUsableFeedUrl`,
`packages/settings/src/origin.ts`) accepts any `https:` host, plus plain
`http:` to a loopback address for local mirrors and tests. That
deliberately permits internal addresses too: an admin can point it at an
RFC1918 or link-local host, and the board will fetch it once a day and on
demand from the Refresh button — a standing SSRF pivot into whatever
network the board can reach.

This is accepted, not fixed, on purpose. `marketplace.feed_url` sits at
the same trust tier as every other admin-only setting a board already
trusts outright — a custom SMTP host, a webhook URL, an OAuth issuer
origin — none of which are resolved-IP checked either; singling this one
out would be inconsistent without buying much, since an admin able to set
it can already reach the network directly. It would also buy less than it
looks like: `isUsableFeedUrl` is a synchronous, isomorphic `zod`
refinement shared between the browser-rendered settings form and the
server-side save path (`packages/settings/src/definitions.ts`), so it has
no way to resolve the hostname — Node's `dns` module does not exist in a
browser bundle, and `refine` here is not async. Moved server-side and made
async, a resolved-IP deny list would still only run once, at save time; it
would not stop a host that resolves to a public address at that moment and
a private one when the daily task or the Refresh button actually fetches
it (DNS rebinding), which is exactly the case a determined or compromised
admin session would use. Given that, the honest fix here is naming the
trust boundary, not a check that would mostly look like one without being
one.

## Moving to a custom board

The stock image is fixed at the version it was built at — nothing can be
installed into a running container, which is exactly why a **Not
installed** listing on a stock board's Browse tab links here rather than
offering an install button. Because the stock image is itself built from
a workspace shaped like [`create-meith`](../contributing/development.md#the-workspace)'s
own scaffold (see [Self-hosting § Custom
boards](../getting-started/deployment/docker-compose.md#custom-boards)), graduating to one is generating
those same files from *this build's own state* and repointing the deploy
— the database is untouched, because the board's identity lives in
Postgres, not in the image.

Three steps, nothing beyond a browser, a GitHub account and the server
you already run.

### 1. Eject

This runs inside the stock image, the same way every other operator
command runs (see [Operating a board § The operator
CLI](../guides/operations/operating.md#the-operator-cli)) — with two additions this one
needs and no other operator command does, because this is the one that
writes a whole new workspace onto your host rather than only reading or
writing the database:

```sh
mkdir my-board
docker compose run --rm --user "$(id -u):$(id -g)" \
  -v "$PWD/my-board:/data/my-board" \
  web community board:eject /data/my-board
```

Run it from the same directory you already run `docker compose` in.
Neither addition is optional:

- **`-v "$PWD/my-board:/data/my-board"`** is what makes `/data/my-board`
  land anywhere real. The image declares no volume at `/data`, and `--rm`
  destroys the container's own filesystem — everything eject wrote —
  the moment the command exits, so without a bind mount the workspace
  eject just built is gone before you can use it.
- **`mkdir my-board` first, then `--user "$(id -u):$(id -g)"`** is what
  lets the container actually write into it. The image runs as a fixed,
  non-root account (`nextjs`, uid 1001) that owns nothing on your host;
  creating the mount point yourself, rather than leaving Docker to create
  it, keeps it owned by you instead of root; and `--user` is what makes
  this one-off container run as you too, so the account writing and the
  account owning the directory are the same one. Skip either half and
  eject fails with `EACCES: permission denied`.

`/data/my-board` is the container's own name for the directory it writes
to — on your host, once the command exits, it is `my-board`, exactly
where `mkdir` made it.

`my-board` becomes a complete workspace: `package.json` pinned to
*this image's exact release version* — never `latest`, so graduating is
never a surprise upgrade — the full deploy kit (`Dockerfile`,
`docker-compose.yml`, `.github/workflows/build.yml`, described in full in
[Self-hosting § Custom boards](../getting-started/deployment/docker-compose.md#custom-boards)),
`board.plugins.json` matching what this build actually compiled in, and
`community.config.ts` matching the stock configuration. Every plugin the
manifest names is also added to `package.json`'s own `dependencies`, at
that same exact version, so the ejected workspace's first build can
actually resolve the imports `community.plugins.ts` writes for it — a
manifest package `create-meith`'s scaffold already pins (`@meith/web`,
`@meith/cli`, `@meith/theme-default`) is left exactly where it is rather
than duplicated. It refuses to write into a directory that already exists
and is not empty, the same as `create-meith` itself — the empty directory
`mkdir` just made, and that the bind mount leaves untouched, passes.

### 2. Push it to GitHub

`my-board` is a plain directory, not a git repository yet:

```sh
cd my-board
git init && git add -A && git commit -m "Graduate from the stock image"
```

Push it to a new, empty repository on GitHub. No local Docker toolchain
needed from here — `.github/workflows/build.yml`, already written, builds
the image on GitHub's own runners the first time this repository's `main`
branch is pushed to.

### 3. Point Coolify at it and redeploy

From here it is the same three-step deploy [Self-hosting § Custom
boards](../getting-started/deployment/docker-compose.md#custom-boards) describes for any scaffolded
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

Once the redeploy is live, the board is an ordinary workspace — a single
`package.json`, not a pnpm monorepo, so it is `npm install` from here, not
`pnpm add`: `forum-web`'s own startup check (`apps/community/bin/forum-web.mjs`)
requires a hoisted `node_modules`, which pnpm's default isolated linker does
not produce. Installing the plugin that started this is `npm install
<package>` and a line in `community.plugins.ts` — the same concept [the
plugin API](./plugins.md#writing-a-plugin) describes for this
repository's own pnpm checkout, just without its workspace machinery —
followed by a commit, a push, and the same redeploy.

## Listing by pull request

There is no submission form. A listing is a pull request against this
repository adding one file to `marketplace/listings/` and its screenshot
to `marketplace/screenshots/` — the same route [HACS](https://hacs.xyz)
uses for its default repository, and for the same reason: a human reviews
it before it is reachable by anyone.

### The review bar

Before a listing is merged, a maintainer checks:

- **The licence is open.** Readable by anyone installing it, granting
  the right to run and modify what it covers, and truthfully named in the
  `licence` field. This project's own MIT licence imposes nothing on a
  listed package, so the check is that the listing's terms are real and
  honestly stated, not that they match ours.
- **The code has actually been read.** Not compiled, not run — read. What
  it imports, what it sends over the network, and whether its migrations
  stay inside its own `plugin_<key>_*` namespace as
  [the plugin API](./plugins.md#the-namespace-is-enforced-where-it-can-be)
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
in [the plugin API](./plugins.md#what-a-plugin-cannot-do) and every
constraint on a theme in [the theme API](./themes.md) applies exactly
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
[Development](../contributing/development.md#the-workspace) — default, midnight,
phasebook, raidframe and clubhouse. Their `version` and `licence` fields
are read from each package's own `package.json`, and `pnpm release:check`
enforces the `version` field directly: for every listing whose `package`
names a workspace package, the listing's `version` must equal that
package's manifest version, the same lockstep [the release
process](../contributing/release.md#one-version-everywhere) holds every other published
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
