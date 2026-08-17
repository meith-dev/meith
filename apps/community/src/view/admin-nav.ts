import type { Translator } from '@meith/i18n'

import {
  currentProps,
  deepestHrefIn,
  isUnder,
  type PanelNav,
  type PanelSection,
  type PanelSubsection,
  sectionHrefIn,
} from './panel-nav'
import { SETTING_GROUP_NAV } from './setting-groups'
import { untranslated } from './time'

export type {
  PanelSection as AdminSection,
  PanelSubsection as AdminSubsection,
} from './panel-nav'
export { currentProps, isUnder }

export const ADMIN_OVERVIEW: PanelSection = {
  href: '/admin',
  titleKey: 'adminNav.admin.title',
  icon: 'overview',
  blurbKey: 'adminNav.admin.blurb',
}

export const ADMIN_SECTIONS: PanelNav = [
  {
    href: '/admin/settings',
    titleKey: 'adminNav.admin-settings.title',
    icon: 'settings',
    blurbKey: 'adminNav.admin-settings.blurb',
    children: SETTING_GROUP_NAV,
  },
  {
    href: '/admin/forums',
    titleKey: 'adminNav.admin-forums.title',
    icon: 'forums',
    blurbKey: 'adminNav.admin-forums.blurb',
  },
  {
    href: '/admin/groups',
    titleKey: 'adminNav.admin-groups.title',
    icon: 'groups',
    blurbKey: 'adminNav.admin-groups.blurb',
    children: [
      { href: '/admin/groups/promotions', titleKey: 'adminNav.admin-groups-promotions.title' },
      { href: '/admin/groups/memberships', titleKey: 'adminNav.admin-groups-memberships.title' },
    ],
  },
  {
    href: '/admin/users',
    titleKey: 'adminNav.admin-users.title',
    icon: 'users',
    blurbKey: 'adminNav.admin-users.blurb',
    children: [
      { href: '/admin/users/mail', titleKey: 'adminNav.admin-users-mail.title' },
      { href: '/admin/users/prune', titleKey: 'adminNav.admin-users-prune.title' },
    ],
  },
  {
    href: '/admin/content',
    titleKey: 'adminNav.admin-content.title',
    icon: 'content',
    blurbKey: 'adminNav.admin-content.blurb',
    children: [
      {
        href: '/admin/content/announcements',
        titleKey: 'adminNav.admin-content-announcements.title',
      },
      { href: '/admin/content/attachments', titleKey: 'adminNav.admin-content-attachments.title' },
    ],
  },
  {
    href: '/admin/antispam',
    titleKey: 'adminNav.admin-antispam.title',
    icon: 'antispam',
    blurbKey: 'adminNav.admin-antispam.blurb',
  },
  {
    href: '/admin/themes',
    titleKey: 'adminNav.admin-themes.title',
    icon: 'themes',
    blurbKey: 'adminNav.admin-themes.blurb',
  },
  {
    href: '/admin/plugins',
    titleKey: 'adminNav.admin-plugins.title',
    icon: 'plugins',
    blurbKey: 'adminNav.admin-plugins.blurb',
  },
  {
    href: '/admin/api-tokens',
    titleKey: 'adminNav.admin-api-tokens.title',
    icon: 'tokens',
    blurbKey: 'adminNav.admin-api-tokens.blurb',
  },
  {
    href: '/admin/system',
    titleKey: 'adminNav.admin-system.title',
    icon: 'system',
    blurbKey: 'adminNav.admin-system.blurb',
  },
  {
    href: '/admin/log',
    titleKey: 'adminNav.admin-log.title',
    icon: 'log',
    blurbKey: 'adminNav.admin-log.blurb',
  },
  {
    href: '/admin/security',
    titleKey: 'adminNav.admin-security.title',
    icon: 'log',
    blurbKey: 'adminNav.admin-security.blurb',
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

export function adminNavWithPlugin(
  plugin: PluginNavSection | null,
  t: Translator = untranslated(),
): PanelNav {
  if (plugin === null || plugin.pages.length === 0) return ADMIN_NAV

  const section: PanelSection = {
    href: `${ADMIN_PLUGINS_HREF}/${plugin.key}`,
    titleText: plugin.name,
    icon: 'plugins',
    blurbText: t.t('adminNav.plugin.blurb', { name: plugin.name }),
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
