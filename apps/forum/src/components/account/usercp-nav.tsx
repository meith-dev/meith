'use client'

import { PanelNav } from '@/components/shell/panel-nav'
import { USERCP_NAV, USERCP_OVERVIEW } from '@/view/usercp-nav'

export function UserCpNav() {
  return <PanelNav nav={USERCP_NAV} overviewHref={USERCP_OVERVIEW.href} />
}
