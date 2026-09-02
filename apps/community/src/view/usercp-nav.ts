import type { Translator } from '@meith/i18n'

import type { PanelNav, PanelSection } from './panel-nav'
import {
  currentProps,
  deepestHrefIn,
  flattenNav,
  isUnder,
  panelText,
  sectionHrefIn,
} from './panel-nav'
import { untranslated } from './time'

export { currentProps, isUnder }

export const USERCP_OVERVIEW: PanelSection = {
  href: '/usercp',
  titleKey: 'userCpNav.usercp.title',
  icon: 'overview',
  blurbKey: 'userCpNav.usercp.blurb',
}

export const USERCP_SECTIONS: PanelNav = [
  {
    href: '/messages',
    titleKey: 'userCpNav.messages.title',
    icon: 'messages',
    blurbKey: 'userCpNav.messages.blurb',
    children: [{ href: '/messages/compose', titleKey: 'userCpNav.messages-compose.title' }],
  },
  {
    href: '/notifications',
    titleKey: 'userCpNav.notifications.title',
    icon: 'notifications',
    blurbKey: 'userCpNav.notifications.blurb',
    children: [
      { href: '/notifications/preferences', titleKey: 'userCpNav.notifications-preferences.title' },
    ],
  },
  {
    href: '/subscriptions',
    titleKey: 'userCpNav.subscriptions.title',
    icon: 'subscriptions',
    blurbKey: 'userCpNav.subscriptions.blurb',
  },
  {
    href: '/usercp/profile',
    titleKey: 'userCpNav.usercp-profile.title',
    icon: 'profile',
    blurbKey: 'userCpNav.usercp-profile.blurb',
  },
  {
    href: '/usercp/avatar',
    titleKey: 'userCpNav.usercp-avatar.title',
    icon: 'avatar',
    blurbKey: 'userCpNav.usercp-avatar.blurb',
  },
  {
    href: '/usercp/signature',
    titleKey: 'userCpNav.usercp-signature.title',
    icon: 'signature',
    blurbKey: 'userCpNav.usercp-signature.blurb',
  },
  {
    href: '/usercp/drafts',
    titleKey: 'userCpNav.usercp-drafts.title',
    icon: 'content',
    blurbKey: 'userCpNav.usercp-drafts.blurb',
  },
  {
    href: '/usercp/contacts',
    titleKey: 'userCpNav.usercp-contacts.title',
    icon: 'buddies',
    blurbKey: 'userCpNav.usercp-contacts.blurb',
  },
  {
    href: '/usercp/options',
    titleKey: 'userCpNav.usercp-options.title',
    icon: 'settings',
    blurbKey: 'userCpNav.usercp-options.blurb',
  },
  {
    href: '/usercp/security',
    titleKey: 'userCpNav.usercp-security.title',
    icon: 'security',
    blurbKey: 'userCpNav.usercp-security.blurb',
  },
]

export const USERCP_NAV: PanelNav = [USERCP_OVERVIEW, ...USERCP_SECTIONS]

export function activeSectionHref(pathname: string): string | null {
  return sectionHrefIn(USERCP_NAV, pathname)
}

export function deepestNavHref(pathname: string): string | null {
  return deepestHrefIn(USERCP_NAV, pathname)
}

export function currentPanelItem(
  pathname: string,
  t: Translator = untranslated(),
): { readonly title: string } | null {
  const deepest = deepestNavHref(pathname)
  if (deepest === null) return null

  const item = flattenNav(USERCP_NAV).find((entry) => entry.href === deepest)
  return item === undefined ? null : { title: panelText(t, item) }
}
