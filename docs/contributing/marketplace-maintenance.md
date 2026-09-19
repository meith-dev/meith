# Maintain the marketplace feed

Maintain listings and the feed consumed by boards. This is contributor reference; extension authors should use Publish to the marketplace.

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
discipline as [the other generated documents](documentation.md).

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
5,000,000 bytes, so a `*.png` filename with some other payload behind it
never reaches meith.dev's public assets.

## The feed URL is a contract

`/marketplace/v1.json` is versioned in its path on purpose. A board built
against today's shape can keep reading it after the shape changes,
because that change ships as `/marketplace/v2.json` alongside it rather
than in place of it.

## Where a board operator browses it

The catalog is browsed on the public marketplace at
[meith.dev/marketplace](https://www.meith.dev/marketplace) — an index of
every listing and a page per listing, built from this same feed at site
build time (`apps/web/app/marketplace`), with the screenshots served from
the site's own public assets. Each listing page carries the description,
the screenshots, the compatibility it declares, and the exact steps to
install it: `npm install <package>` and `meith plugin:add <package>`
for a plugin, or the install plus a `meith.config.ts` line for a
theme, and a link back here. It is a page to read, not a button that
pretends to act, because nothing installs a package but the operator, in
the board repository they own.

Those steps name `npm`, never `pnpm add … --filter @meith/web`. What
installs a listing is a *board*, and a board — scaffolded by
`create-meith`, or graduated out of the stock image by `board:eject` — is
a single `package.json` whose `forum-web` needs a hoisted `node_modules`,
not this repository's pnpm workspace: the filter names a workspace that
does not exist out there, and pnpm's default linker produces a tree the
board cannot build from. The monorepo form belongs in [the plugin
API](../extensions/plugins.md), whose reader really is in a checkout
of this repository.

## The board-side consumer: update checks

The board does not browse the catalog; that is what the public pages
above are for. What the board itself does with the feed is narrower and
specific to what it already runs — it tells the operator when something
installed has a newer version worth moving to.

`marketplace.feed_url` is a board setting (**Settings → Board**, under
**Show advanced**), defaulting to the URL above, so a self-hosted mirror
serving the same shape works as a drop-in replacement. **The board fetches it, never the
member's or the operator's browser** — a `marketplace.refresh_catalog`
task (`packages/tasks`) fetches, validates against the same shape this
document describes, and caches the result once a day; the **Check for
updates** button on **Admin → Plugins** and **Admin → Themes** runs the
identical pass on demand (`refreshCatalog` in `packages/marketplace`,
called by both the task and the admin action — one implementation, not
two). A board with no outbound network fails the fetch quietly — logged,
not alarmed — and those pages carry a plain note that the marketplace
could not be reached; whatever it last fetched successfully keeps
informing the check.

For each installed plugin and theme, the board compares the version it
runs against the version the feed lists (`computeListingStatus` in
`packages/marketplace`) and, when the feed's is newer and compatible with
this build, marks that row **Update available** with the version to move
to on the **Plugins** or **Themes** page. A plugin declares its version in
`definePlugin`; a theme declares its in `defineTheme`, so the check covers
themes exactly as it covers plugins. A newer version that is incompatible
— its `apiVersion` or `meith` range fails against this build — is not
offered, because installing it would not work.

When the daily fetch first sees a newer, compatible version of an
installed plugin or theme, administrators are notified through the board's
own notification system (`marketplace.update_available`, a staff-audience
kind next to `system.task_failed`) once per (key, version) ever —
independent of whether that notification has since been read, which a
bare dedupe key on the notification service is not.

The daily task and an admin's **Check for updates** click can land on the
same newly-seen version at the same moment, so "once ever" is enforced by
claiming the (key, version) marker atomically before the notification
is raised, not by checking it and writing it back afterwards — a
`PostgresMarketplaceCacheRepository.claimNotified` call is a single
`UPDATE ... WHERE NOT (already claimed)` against the one
`marketplace_catalog` row, so a second, concurrent caller either blocks
behind the row lock and then sees the marker already there, or loses the
`WHERE` race outright; either way it reports the claim as already taken
and `refreshCatalog` skips the notification. The marker is written before
the notification is raised, on purpose: if raising the notification then
throws, this build has claimed a (key, version) it never actually
announced, and will not retry it — a missed notice, not a duplicate one.
That is the accepted failure mode, because the update line on the Plugins
and Themes pages is computed fresh from the cached feed on every read,
independent of the notified-marker set; a missed notification is
recoverable by the operator simply visiting those pages, where a duplicate
notification for the same version, ever, is the one thing this system
promises not to do.

See [The organiser's guide § When to hand it to somebody
technical](../administration/manage-members.md#when-to-hand-it-to-somebody-technical) for
the operator-facing walkthrough.

### Outbound fetches do not follow redirects

The board's one outbound fetch to an untrusted host — the daily/on-demand
catalog fetch (`packages/marketplace/src/fetch.ts`) — passes
`redirect: 'manual'` and treats any non-2xx response, a redirect included,
as a failed fetch, exactly like an unreachable host or a 503. The feed
host is an admin-configured address (see below) that could answer with a
`302` to a link-local or RFC1918 target; left unhandled, the fetch would
follow it before its own shape validation caught the mismatch — usable as
a reachability or timing probe into a network the feed host itself cannot
otherwise reach. Refusing to follow closes that without changing how a
redirect-free feed host behaves.

The fetch also refuses to buffer a hostile body whole before enforcing its
size cap. A `Content-Length` over the cap is rejected before any read
begins; otherwise the body is read through `readCappedBody`
(`packages/marketplace/src/fetch.ts`), which walks the response stream
chunk by chunk and cancels it the moment the running total passes the cap,
rather than accumulating the whole thing first. The existing 10-second
abort timeout is unchanged.

### The feed URL is an admin-trusted setting

`marketplace.feed_url` (validated by `isUsableFeedUrl`,
`packages/settings/src/origin.ts`) accepts any `https:` host, plus plain
`http:` to a loopback address for local mirrors and tests. That
deliberately permits internal addresses too: an admin can point it at an
RFC1918 or link-local host, and the board will fetch it once a day and on
demand from the **Check for updates** button — a standing SSRF pivot into
whatever network the board can reach.

This is accepted, not fixed, on purpose. `marketplace.feed_url` sits at
the same trust tier as every other admin-only setting a board already
trusts outright — a custom SMTP host, a webhook URL, an OAuth issuer
origin — and an admin able to set it can already reach the network
directly. The mail and webhook destinations are resolved-and-pinned before
each connection, but they had to be: a mail endpoint is reached on a
member's password-reset, and a webhook and a web-push endpoint carry
member-supplied data outward, so those requests are made on a visitor's
behalf and cannot inherit the admin's trust. The catalog fetch is
different — it runs only from the daily task and the admin's own **Check
for updates** button, never from a visitor's request. Guarding it would
also buy less than it looks like: `isUsableFeedUrl` is a synchronous, isomorphic `zod`
refinement shared between the browser-rendered settings form and the
server-side save path (`packages/settings/src/definitions.ts`), so it has
no way to resolve the hostname — Node's `dns` module does not exist in a
browser bundle, and `refine` here is not async. Moved server-side and made
async, a resolved-IP deny list would still only run once, at save time; it
would not stop a host that resolves to a public address at that moment and
a private one when the daily task or the **Check for updates** button
actually fetches it (DNS rebinding), which is exactly the case a
determined or compromised
admin session would use. Given that, the honest fix here is naming the
trust boundary, not a check that would mostly look like one without being
one.

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

Nine first-party listings: **Dues**, **Calendar**, **Awards** and the six themes
described in [Development](board-workspaces.md#the-workspace) — default,
midnight, phasebook, raidframe, clubhouse and meith. Their `version` and `licence` fields
are read from each package's own `package.json`, and `pnpm release:check`
enforces the `version` field directly: for every listing whose `package`
names a workspace package, the listing's `version` must equal that
package's manifest version, the same lockstep [the release
process](release-infrastructure.md#one-version-everywhere) holds every other published
package to. `pnpm release:bump` moves the listings and runs `pnpm
marketplace:gen` in the same pass, so a release always lands with a feed
that already matches them. A third-party listing's `package` does not
resolve to a workspace package, so the check leaves it alone — it tracks
its own release, as [above](../extensions/marketplace.md) explains.

**Their screenshots are placeholders** — a small solid-colour PNG per
listing, generated rather than captured, standing in until real marketing
screenshots exist. Nothing about them claims to show the product; they
exist so the feed's screenshot pipeline (validate, copy, publish) has real
files to prove itself against. Replacing one is the same pull request as
any other listing update: a new PNG in `marketplace/screenshots/`, the
filename changed in the listing, `pnpm marketplace:gen`.
