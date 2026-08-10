import {
  type PanelNav,
  type PanelSection,
  currentProps,
  deepestHrefIn,
  isUnder,
  sectionHrefIn,
} from './panel-nav'
import { SETTING_GROUP_NAV } from './setting-groups'

export { currentProps, isUnder }
export type {
  PanelSection as AdminSection,
  PanelSubsection as AdminSubsection,
} from './panel-nav'

export const ADMIN_OVERVIEW: PanelSection = {
  href: '/admin',
  title: 'Overview',
  blurb: 'What is waiting, the board at a glance, and the latest activity.',
}

export const ADMIN_SECTIONS: PanelNav = [
  {
    href: '/admin/settings',
    title: 'Board settings',
    blurb: 'Every setting this build has, grouped and searchable.',
    children: SETTING_GROUP_NAV,
  },
  {
    href: '/admin/forums',
    title: 'Forums',
    blurb: 'The tree, each forum’s options, and the permission matrix.',
  },
  {
    href: '/admin/groups',
    title: 'Groups',
    blurb: 'What each group allows, promotions, and mass membership changes.',
    children: [
      { href: '/admin/groups/promotions', title: 'Promotions' },
      { href: '/admin/groups/memberships', title: 'Mass membership' },
    ],
  },
  {
    href: '/admin/users',
    title: 'Users',
    blurb: 'Find an account, change it, merge or prune, or mail the board.',
    children: [
      { href: '/admin/users/mail', title: 'Mass mail' },
      { href: '/admin/users/prune', title: 'Prune members' },
    ],
  },
  {
    href: '/admin/content',
    title: 'Content',
    blurb: 'Announcements, attachments, and the housekeeping around them.',
    children: [
      { href: '/admin/content/announcements', title: 'Announcements' },
      { href: '/admin/content/attachments', title: 'Attachments' },
    ],
  },
  {
    href: '/admin/antispam',
    title: 'Anti-spam',
    blurb: 'The honeypot, the question, the limits, and first-post moderation.',
  },
  {
    href: '/admin/themes',
    title: 'Themes',
    blurb: 'Installed themes, their tokens, and this board’s overrides.',
  },
  {
    href: '/admin/plugins',
    title: 'Plugins',
    blurb: 'What is installed, what it may do, and what has been failing.',
  },
  {
    href: '/admin/api-tokens',
    title: 'API tokens',
    blurb: 'Issue and revoke tokens, and see what each one may reach.',
  },
  {
    href: '/admin/system',
    title: 'System',
    blurb: 'Scheduled tasks, the search index, caches, and the build.',
  },
  {
    href: '/admin/log',
    title: 'Admin log',
    blurb: 'Every administrative and moderation action, with who and from where.',
  },
]

export const ADMIN_NAV: PanelNav = [ADMIN_OVERVIEW, ...ADMIN_SECTIONS]

export function activeSectionHref(pathname: string): string {
  return sectionHrefIn(ADMIN_NAV, pathname) ?? ADMIN_OVERVIEW.href
}

export function deepestNavHref(pathname: string): string {
  return deepestHrefIn(ADMIN_NAV, pathname) ?? ADMIN_OVERVIEW.href
}
