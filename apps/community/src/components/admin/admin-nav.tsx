'use client'

/**
 * The control panel's section navigation.
 *
 * A tree and a fallback; everything else — the sticky rail, the `<details>`
 * that replaces it on a phone, `aria-current`, why it is a client component at
 * all — is in `@/components/shell/panel-nav`, which the member's control panel
 * renders too.
 *
 * `fallbackHref` is `/admin`, and that is the one behaviour this panel does not
 * share with the other: every ACP address begins `/admin`, so a screen this
 * tree has never heard of is still inside the panel and the overview is the
 * honest thing to light. The member's panel is spread across four route trees
 * and has no such prefix.
 */

import { PanelNav } from '@/components/shell/panel-nav'
import { ADMIN_NAV, ADMIN_OVERVIEW } from '@/view/admin-nav'

export function AdminNav() {
  return (
    <PanelNav
      nav={ADMIN_NAV}
      overviewHref={ADMIN_OVERVIEW.href}
      fallbackHref={ADMIN_OVERVIEW.href}
    />
  )
}
