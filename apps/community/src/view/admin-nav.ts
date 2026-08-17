import {
  type PanelNav,
  type PanelSection,
  type PanelSubsection,
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
  icon: 'overview',
  blurb: 'What is waiting, the board at a glance, and the latest activity.',
}

export const ADMIN_SECTIONS: PanelNav = [
  {
    href: '/admin/settings',
    title: 'Board settings',
    icon: 'settings',
    blurb: 'Every setting this build has, grouped and searchable.',
    children: SETTING_GROUP_NAV,
  },
  {
    href: '/admin/forums',
    title: 'Forums',
    icon: 'forums',
    blurb: 'The tree, each forum’s options, and the permission matrix.',
  },
  {
    href: '/admin/groups',
    title: 'Groups',
    icon: 'groups',
    blurb: 'What each group allows, promotions, and mass membership changes.',
    children: [
      { href: '/admin/groups/promotions', title: 'Promotions' },
      { href: '/admin/groups/memberships', title: 'Mass membership' },
    ],
  },
  {
    href: '/admin/users',
    title: 'Users',
    icon: 'users',
    blurb: 'Find an account, change it, merge or prune, or mail the board.',
    children: [
      { href: '/admin/users/mail', title: 'Mass mail' },
      { href: '/admin/users/prune', title: 'Prune members' },
    ],
  },
  {
    href: '/admin/content',
    title: 'Content',
    icon: 'content',
    blurb: 'Announcements, attachments, and the housekeeping around them.',
    children: [
      { href: '/admin/content/announcements', title: 'Announcements' },
      { href: '/admin/content/attachments', title: 'Attachments' },
    ],
  },
  {
    href: '/admin/antispam',
    title: 'Anti-spam',
    icon: 'antispam',
    blurb: 'The honeypot, the question, the limits, and first-post moderation.',
  },
  {
    href: '/admin/themes',
    title: 'Themes',
    icon: 'themes',
    blurb: 'Installed themes, their tokens, and this board’s overrides.',
  },
  {
    href: '/admin/plugins',
    title: 'Plugins',
    icon: 'plugins',
    blurb: 'What is installed, what it may do, and what has been failing.',
  },
  {
    href: '/admin/api-tokens',
    title: 'API tokens',
    icon: 'tokens',
    blurb: 'Issue and revoke tokens, and see what each one may reach.',
  },
  {
    href: '/admin/analytics',
    title: 'Analytics',
    icon: 'analytics',
    blurb: 'What is being read, by how many, and where they arrived from.',
  },
  {
    href: '/admin/system',
    title: 'System',
    icon: 'system',
    blurb: 'Scheduled tasks, the search index, caches, and the build.',
  },
  {
    href: '/admin/log',
    title: 'Admin log',
    icon: 'log',
    blurb: 'Every administrative and moderation action, with who and from where.',
  },
  {
    href: '/admin/security',
    title: 'Sign-in activity',
    icon: 'log',
    blurb: 'Sign-ins, refusals, and what members changed about how they get in.',
  },
]

export const ADMIN_NAV: PanelNav = [ADMIN_OVERVIEW, ...ADMIN_SECTIONS]

export const ADMIN_PLUGINS_HREF = '/admin/plugins'

const PLUGIN_KEY_PATTERN = /^\/admin\/plugins\/([a-z][a-z0-9-]*)(?:\/|$|\?)/

export function pluginKeyAt(pathname: string): string | null {
  return PLUGIN_KEY_PATTERN.exec(pathname)?.[1] ?? null
}

export interface PluginNavSection {
  readonly key: string
  readonly name: string
  readonly pages: readonly PanelSubsection[]
}

export function adminNavWithPlugin(plugin: PluginNavSection | null): PanelNav {
  if (plugin === null || plugin.pages.length === 0) return ADMIN_NAV

  const section: PanelSection = {
    href: `${ADMIN_PLUGINS_HREF}/${plugin.key}`,
    title: plugin.name,
    icon: 'plugins',
    blurb: `Every screen ${plugin.name} adds to the panel.`,
    children: plugin.pages,
  }

  const at = ADMIN_NAV.findIndex((entry) => entry.href === ADMIN_PLUGINS_HREF)

  return [...ADMIN_NAV.slice(0, at + 1), section, ...ADMIN_NAV.slice(at + 1)]
}

export function activeSectionHref(pathname: string, nav: PanelNav = ADMIN_NAV): string {
  return sectionHrefIn(nav, pathname) ?? ADMIN_OVERVIEW.href
}

export function deepestNavHref(pathname: string, nav: PanelNav = ADMIN_NAV): string {
  return deepestHrefIn(nav, pathname) ?? ADMIN_OVERVIEW.href
}
