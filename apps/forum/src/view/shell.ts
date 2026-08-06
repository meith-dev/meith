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

export function buildBoardNavigation(viewer: ViewerModel): readonly LinkModel[] {
  return [
    { label: 'Forums', href: '/' },
    { label: 'New posts', href: '/discover/new' },
    { label: 'Unanswered', href: '/discover/unanswered' },
    ...(viewer.isGuest ? [] : [{ label: 'My posts', href: '/discover/participated' }]),
    { label: 'Search', href: '/search' },
    { label: "Who's online", href: '/online' },
  ]
}

export function buildUserPanelModel(
  viewer: ViewerModel,
  options: { unreadNotifications?: number; unreadMessages?: number } = {},
): UserPanelModel {
  const links: readonly LinkModel[] = viewer.isGuest
    ? [
        { label: 'Sign in', href: '/login' },
        { label: 'Register', href: '/register' },
      ]
    : viewer.profileHref === null
      ? []
      : [
          { label: 'Profile', href: viewer.profileHref },
          { label: 'Your control panel', href: '/usercp' },
          { label: 'Notifications', href: '/notifications' },
          { label: 'Messages', href: '/messages' },
          { label: 'Subscriptions', href: '/subscriptions' },
          ...(viewer.canAccessModCp
            ? [
                { label: 'Moderator CP', href: '/modcp' },
                { label: 'Moderation queue', href: '/moderation' },
                { label: 'Reports', href: '/moderation/reports' },
              ]
            : []),
        ]

  return {
    viewer,
    links,
    unreadNotifications: options.unreadNotifications ?? 0,
    unreadMessages: options.unreadMessages ?? 0,
  }
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
