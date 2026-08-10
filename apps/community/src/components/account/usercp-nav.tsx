'use client'

import { PanelNav } from '@/components/shell/panel-nav'
import type { PanelCounts } from '@/view/panel-nav'
import { USERCP_NAV, USERCP_OVERVIEW } from '@/view/usercp-nav'

export function UserCpNav({ counts }: { readonly counts: PanelCounts }) {
  return <PanelNav nav={USERCP_NAV} overviewHref={USERCP_OVERVIEW.href} counts={counts} />
}
