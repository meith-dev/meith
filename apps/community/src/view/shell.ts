import type { Actor } from '@meith/authorization'
import type {
  FooterModel,
  HeaderModel,
  LinkModel,
  LogoModel,
  UserPanelModel,
  ViewerModel,
} from '@meith/theme-kit'

import { memberHref } from './member-profile'
import { timezoneLabel } from './time'

export const BOARD_TITLE = 'Meith'

export const TIMEZONE_LABEL = 'UTC'

export function buildViewerModel(
  actor: Actor,
  options: {
    displayName?: string | null
    canAccessAdminCp?: boolean
    canAccessModCp?: boolean
    avatarUrl?: string | null
  } = {},
): ViewerModel {
  const isGuest = actor.userId === null

  return {
    isGuest,
    userId: actor.userId,
    username: options.displayName ?? null,
    profileHref: actor.userId === null ? null : memberHref(actor.userId),
    avatarUrl: options.avatarUrl ?? null,
    canAccessAdminCp: options.canAccessAdminCp ?? false,
    canAccessModCp: options.canAccessModCp ?? false,
  }
}

export function buildHeaderModel(
  viewer: ViewerModel,
  navigation: readonly LinkModel[] = [],
  boardTitle: string = BOARD_TITLE,
  logo: LogoModel | null = null,
): HeaderModel {
  return {
    boardTitle,
    homeHref: '/',
    viewer,
    navigation,
    ...(logo === null ? {} : { logo }),
  }
}

export function buildBoardNavigation(
  viewer: ViewerModel,
  options: { searchEnabled?: boolean } = {},
): readonly LinkModel[] {
  return [
    { label: 'Home', href: '/' },
    { label: 'New posts', href: '/discover/new' },
    { label: 'Unanswered', href: '/discover/unanswered' },
    ...(viewer.isGuest ? [] : [{ label: 'My posts', href: '/discover/participated' }]),
    ...(options.searchEnabled === false ? [] : [{ label: 'Search', href: '/search' }]),
    { label: "Who's online", href: '/online' },
  ]
}

const ACCOUNT_GROUP = 'account'

const STAFF_GROUP = 'staff'

const NOTIFICATIONS_HREF = '/notifications'

const MESSAGES_HREF = '/messages'

export function buildUserPanelModel(
  viewer: ViewerModel,
  options: {
    unreadNotifications?: number
    unreadMessages?: number
    registrationOpen?: boolean
  } = {},
): UserPanelModel {
  const links: readonly LinkModel[] = viewer.isGuest
    ? [
        { label: 'Sign in', href: '/login' },
        ...(options.registrationOpen === false ? [] : [{ label: 'Register', href: '/register' }]),
      ]
    : viewer.profileHref === null
      ? []
      : [
          { label: 'Profile', href: viewer.profileHref, group: ACCOUNT_GROUP },
          { label: 'Your control panel', href: '/usercp', group: ACCOUNT_GROUP },
          { label: 'Notifications', href: NOTIFICATIONS_HREF, group: ACCOUNT_GROUP },
          { label: 'Messages', href: MESSAGES_HREF, group: ACCOUNT_GROUP },
          { label: 'Subscriptions', href: '/subscriptions', group: ACCOUNT_GROUP },
          ...(viewer.canAccessAdminCp
            ? [{ label: 'Admin CP', href: '/admin', group: STAFF_GROUP }]
            : []),
          ...(viewer.canAccessModCp
            ? [
                { label: 'Moderator CP', href: '/modcp', group: STAFF_GROUP },
                { label: 'Moderation queue', href: '/moderation', group: STAFF_GROUP },
                { label: 'Reports', href: '/moderation/reports', group: STAFF_GROUP },
              ]
            : []),
        ]

  return {
    viewer,
    links,
    unreadNotifications: options.unreadNotifications ?? 0,
    unreadMessages: options.unreadMessages ?? 0,
    ...(viewer.isGuest
      ? {}
      : { notificationsHref: NOTIFICATIONS_HREF, messagesHref: MESSAGES_HREF }),
  }
}

export type PanelKey = 'usercp' | 'modcp' | 'admincp'

const PANELS: readonly { readonly key: PanelKey; readonly link: LinkModel }[] = [
  { key: 'usercp', link: { label: 'Your control panel', href: '/usercp' } },
  { key: 'modcp', link: { label: 'Moderator CP', href: '/modcp' } },
  { key: 'admincp', link: { label: 'Admin CP', href: '/admin' } },
]

export function buildPanelLinks(input: {
  readonly current: PanelKey
  readonly canAccessModCp?: boolean
  readonly canAccessAdminCp?: boolean
}): readonly LinkModel[] {
  const reachable: Record<PanelKey, boolean> = {
    usercp: true,
    modcp: input.canAccessModCp === true,
    admincp: input.canAccessAdminCp === true,
  }

  return PANELS.filter((panel) => panel.key !== input.current && reachable[panel.key]).map(
    (panel) => panel.link,
  )
}

const POWERED_BY: LinkModel = { label: 'Powered by Meith', href: 'https://meith.dev' }

export function buildFooterModel(
  links: readonly LinkModel[] = [],
  boardTitle: string = BOARD_TITLE,
  zone: string = TIMEZONE_LABEL,
): FooterModel {
  return {
    boardTitle,
    links,
    timezoneLabel: timezoneLabel(zone),
    poweredBy: POWERED_BY,
  }
}
