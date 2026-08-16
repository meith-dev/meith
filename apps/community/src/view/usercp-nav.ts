import type { PanelNav, PanelSection } from './panel-nav'

import { currentProps, deepestHrefIn, flattenNav, isUnder, sectionHrefIn } from './panel-nav'

export { currentProps, isUnder }

export const USERCP_OVERVIEW: PanelSection = {
  href: '/usercp',
  title: 'Overview',
  icon: 'overview',
  blurb: 'What is waiting for you, and everything you can change.',
}

export const USERCP_SECTIONS: PanelNav = [
  {
    href: '/messages',
    title: 'Private messages',
    icon: 'messages',
    blurb: 'Your inbox, and what you have sent.',
    children: [{ href: '/messages/compose', title: 'Write a message' }],
  },
  {
    href: '/notifications',
    title: 'Notifications',
    icon: 'notifications',
    blurb: 'What the board has told you, and which of it also reaches you by e-mail.',
    children: [{ href: '/notifications/preferences', title: 'Preferences' }],
  },
  {
    href: '/subscriptions',
    title: 'Subscriptions',
    icon: 'subscriptions',
    blurb: 'The threads and forums you follow, and how often you hear about them.',
  },
  {
    href: '/usercp/profile',
    title: 'Profile',
    icon: 'profile',
    blurb: 'What other members see about you.',
  },
  {
    href: '/usercp/avatar',
    title: 'Avatar',
    icon: 'avatar',
    blurb: 'The picture shown beside your posts.',
  },
  {
    href: '/usercp/signature',
    title: 'Signature',
    icon: 'signature',
    blurb: 'What appears under every post you make.',
  },
  {
    href: '/usercp/contacts',
    title: 'Buddies and ignored members',
    icon: 'buddies',
    blurb: 'Who you follow, and whose posts you would rather not read.',
  },
  {
    href: '/usercp/options',
    title: 'Options',
    icon: 'settings',
    blurb: 'Your timezone, and how much of a thread fits on a page.',
  },
  {
    href: '/usercp/security',
    title: 'E-mail and password',
    icon: 'security',
    blurb: 'Both need your current password.',
  },
]

export const USERCP_NAV: PanelNav = [USERCP_OVERVIEW, ...USERCP_SECTIONS]

export function activeSectionHref(pathname: string): string | null {
  return sectionHrefIn(USERCP_NAV, pathname)
}

export function deepestNavHref(pathname: string): string | null {
  return deepestHrefIn(USERCP_NAV, pathname)
}

export function currentPanelItem(pathname: string): { readonly title: string } | null {
  const deepest = deepestNavHref(pathname)
  if (deepest === null) return null
  return flattenNav(USERCP_NAV).find((item) => item.href === deepest) ?? null
}
