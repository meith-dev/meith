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
 */

import { PanelNav } from '@/components/shell/panel-nav'
import { USERCP_NAV, USERCP_OVERVIEW } from '@/view/usercp-nav'

export function UserCpNav() {
  return <PanelNav nav={USERCP_NAV} overviewHref={USERCP_OVERVIEW.href} />
}
