import type { Translator } from '@meith/i18n'

import type { PluginNavSection } from './admin-nav'
import {
  currentProps,
  deepestHrefIn,
  isUnder,
  type PanelNav,
  type PanelSection,
  sectionHrefIn,
} from './panel-nav'
import { untranslated } from './time'

export { currentProps, isUnder }

export interface ModCpNavAccess {
  readonly canWarn: boolean
  readonly canLookUpIp: boolean
}

export const MODCP_OVERVIEW: PanelSection = {
  href: '/modcp',
  titleKey: 'modCpNav.modcp.title',
  icon: 'overview',
  blurbKey: 'modCpNav.modcp.blurb',
}

export function modCpSections(access: ModCpNavAccess): PanelNav {
  return [
    {
      href: '/moderation',
      titleKey: 'modCpNav.moderation.title',
      icon: 'queue',
      blurbKey: 'modCpNav.moderation.blurb',
      children: access.canWarn
        ? [{ href: '/moderation/warn', titleKey: 'modCpNav.moderation-warn.title', record: true }]
        : [],
    },
    {
      href: '/moderation/reports',
      titleKey: 'modCpNav.moderation-reports.title',
      icon: 'reports',
      blurbKey: 'modCpNav.moderation-reports.blurb',
    },
    {
      href: '/modcp/forums',
      titleKey: 'modCpNav.modcp-forums.title',
      icon: 'forums',
      blurbKey: 'modCpNav.modcp-forums.blurb',
    },
    {
      href: '/modcp/log',
      titleKey: 'modCpNav.modcp-log.title',
      icon: 'log',
      blurbKey: 'modCpNav.modcp-log.blurb',
    },
    ...(access.canLookUpIp
      ? ([
          {
            href: '/modcp/ip',
            titleKey: 'modCpNav.modcp-ip.title',
            icon: 'ip',
            blurbKey: 'modCpNav.modcp-ip.blurb',
          },
        ] satisfies PanelNav)
      : []),
  ]
}

export function modCpNav(access: ModCpNavAccess): PanelNav {
  return [MODCP_OVERVIEW, ...modCpSections(access)]
}

export const MODCP_PLUGINS_HREF = '/modcp/plugins'

const MODCP_PLUGIN_KEY_PATTERN = /^\/modcp\/plugins\/([a-z][a-z0-9-]*)(?:\/|$|\?)/

export function pluginKeyAtModCp(pathname: string): string | null {
  return MODCP_PLUGIN_KEY_PATTERN.exec(pathname)?.[1] ?? null
}

export function modCpNavWithPlugin(
  access: ModCpNavAccess,
  plugin: PluginNavSection | null,
  t: Translator = untranslated(),
): PanelNav {
  const base = modCpNav(access)
  if (plugin === null || plugin.pages.length === 0) return base

  const href = `${MODCP_PLUGINS_HREF}/${plugin.key}`
  const section: PanelSection = {
    href,
    titleText: plugin.name,
    icon: 'plugins',
    blurbText: t.t('modCpNav.plugin.blurb', { name: plugin.name }),
    children: plugin.pages.filter((page) => page.href !== href),
  }

  return [...base, section]
}

export function activeSectionHref(access: ModCpNavAccess, pathname: string): string | null {
  return sectionHrefIn(modCpNav(access), pathname)
}

export function deepestNavHref(access: ModCpNavAccess, pathname: string): string | null {
  return deepestHrefIn(modCpNav(access), pathname)
}
