import {
  type PanelNav,
  type PanelSection,
  currentProps,
  deepestHrefIn,
  isUnder,
  sectionHrefIn,
} from './panel-nav'

export { currentProps, isUnder }

export interface ModCpNavAccess {
  readonly canWarn: boolean
  readonly canLookUpIp: boolean
}

export const MODCP_OVERVIEW: PanelSection = {
  href: '/modcp',
  title: 'Overview',
  blurb: 'What is waiting across the forums you moderate, and where you may act.',
}

export function modCpSections(access: ModCpNavAccess): PanelNav {
  return [
    {
      href: '/moderation',
      title: 'Approval queue',
      blurb: 'Posts and threads held for approval in the forums you moderate.',
      children: access.canWarn
        ? [{ href: '/moderation/warn', title: 'Warn a member', record: true }]
        : [],
    },
    {
      href: '/moderation/reports',
      title: 'Reports',
      blurb: 'What members have reported, who has picked it up, and what came of it.',
    },
    {
      href: '/modcp/forums',
      title: 'My forums',
      blurb: 'Where you are appointed, and exactly what you may do in each.',
    },
    {
      href: '/modcp/log',
      title: 'Moderator log',
      blurb: 'What has been done in your forums, by whom, and when.',
    },
    ...(access.canLookUpIp
      ? [
          {
            href: '/modcp/ip',
            title: 'Address lookup',
            blurb: 'Who else has posted from an address. Every lookup is logged.',
          },
        ]
      : []),
  ]
}

export function modCpNav(access: ModCpNavAccess): PanelNav {
  return [MODCP_OVERVIEW, ...modCpSections(access)]
}

export function activeSectionHref(
  access: ModCpNavAccess,
  pathname: string,
): string | null {
  return sectionHrefIn(modCpNav(access), pathname)
}

export function deepestNavHref(
  access: ModCpNavAccess,
  pathname: string,
): string | null {
  return deepestHrefIn(modCpNav(access), pathname)
}
