"use client";

/**
 * The moderator control panel's section navigation.
 *
 * The ACP's rail, with this panel's tree — see `@/components/shell/panel-nav`
 * for how it behaves and `@/view/modcp-nav` for what is in it.
 *
 * The tree arrives as a prop rather than being imported here, which is the one
 * thing this caller does differently from `AdminNav` and `UserCpNav`. Those two
 * show the same sections to everybody who can see the panel at all, so their
 * trees are constants a client module can import and keep out of the RSC
 * payload. A moderator's sections depend on what that moderator may do — the
 * address lookup reads personal data and is staff-only, the warn screen needs
 * `user.warn` — so the tree is resolved on the server, per request, and crosses
 * as a dozen short strings.
 *
 * No `fallbackHref`. The ACP can assume an unrecognised `/admin/...` address is
 * still inside the panel and light the overview; this rail is rendered by
 * `/modcp` and `/moderation` both, so "outside the tree" is a real state and
 * lighting nothing is the truthful answer.
 */

import { PanelNav } from "@/components/shell/panel-nav";
import type { PanelCounts, PanelNav as PanelNavTree } from "@/view/panel-nav";
import { MODCP_OVERVIEW } from "@/view/modcp-nav";

export function ModCpNav({
  nav,
  counts,
}: {
  readonly nav: PanelNavTree;
  readonly counts: PanelCounts;
}) {
  return (
    <PanelNav nav={nav} overviewHref={MODCP_OVERVIEW.href} counts={counts} />
  );
}
