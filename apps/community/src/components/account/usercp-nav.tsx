'use client'

/**
 * The member control panel's section navigation.
 *
 * The ACP's rail, with this panel's tree — see `@/components/shell/panel-nav`
 * for how it behaves and `@/view/usercp-nav` for what is in it.
 *
 * No `fallbackHref`. The ACP can assume an unrecognised `/admin/...` address is
 * still inside the panel and light the overview; this rail is rendered by
 * `/usercp`, `/messages`, `/notifications` and `/subscriptions`, so "outside
 * the tree" is a real state and lighting nothing is the truthful answer.
 *
 * The counts come across as a prop rather than being read here, because reading
 * them is a database question and this module runs in the browser. The shell
 * has them already — they are the same two `React.cache`d counts the header's
 * badges were rendered from.
 */

import { PanelNav } from '@/components/shell/panel-nav'
import type { PanelCounts } from '@/view/panel-nav'
import { USERCP_NAV, USERCP_OVERVIEW } from '@/view/usercp-nav'

export function UserCpNav({ counts }: { readonly counts: PanelCounts }) {
  return <PanelNav nav={USERCP_NAV} overviewHref={USERCP_OVERVIEW.href} counts={counts} />
}
