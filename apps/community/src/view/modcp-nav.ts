import {
  currentProps,
  deepestHrefIn,
  isUnder,
  type PanelNav,
  type PanelSection,
  sectionHrefIn,
} from './panel-nav'

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

export function activeSectionHref(access: ModCpNavAccess, pathname: string): string | null {
  return sectionHrefIn(modCpNav(access), pathname)
}

export function deepestNavHref(access: ModCpNavAccess, pathname: string): string | null {
  return deepestHrefIn(modCpNav(access), pathname)
}
