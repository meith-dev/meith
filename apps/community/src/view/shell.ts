import type { Actor } from '@meith/authorization'
import type { Translator } from '@meith/i18n'
import type {
  FooterModel,
  HeaderModel,
  LinkModel,
  LogoModel,
  UserPanelModel,
  ViewerModel,
} from '@meith/theme-kit'

import { count } from './count'
import { memberHref } from './member-profile'
import { buildNavigation, defaultNavigationItems } from './navigation'
import { timezoneLabel, untranslated } from './time'

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
  options: { searchEnabled?: boolean; t?: Translator } = {},
): readonly LinkModel[] {
  return buildNavigation(defaultNavigationItems(), viewer, options)
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
    t?: Translator
  } = {},
): UserPanelModel {
  const t = options.t ?? untranslated()

  const links: readonly LinkModel[] = viewer.isGuest
    ? [
        { label: t.t('nav.signIn'), href: '/login' },
        ...(options.registrationOpen === false
          ? []
          : [{ label: t.t('nav.register'), href: '/register' }]),
      ]
    : viewer.profileHref === null
      ? []
      : [
          { label: t.t('nav.profile'), href: viewer.profileHref, group: ACCOUNT_GROUP },
          { label: t.t('nav.userCp'), href: '/usercp', group: ACCOUNT_GROUP },
          { label: t.t('nav.notifications'), href: NOTIFICATIONS_HREF, group: ACCOUNT_GROUP },
          { label: t.t('nav.messages'), href: MESSAGES_HREF, group: ACCOUNT_GROUP },
          { label: t.t('nav.subscriptions'), href: '/subscriptions', group: ACCOUNT_GROUP },
          ...(viewer.canAccessAdminCp
            ? [{ label: t.t('nav.adminCp'), href: '/admin', group: STAFF_GROUP }]
            : []),
          ...(viewer.canAccessModCp
            ? [
                { label: t.t('nav.modCp'), href: '/modcp', group: STAFF_GROUP },
                { label: t.t('nav.moderationQueue'), href: '/moderation', group: STAFF_GROUP },
                { label: t.t('nav.reports'), href: '/moderation/reports', group: STAFF_GROUP },
              ]
            : []),
        ]

  return {
    viewer,
    links,
    unreadNotifications: count(options.unreadNotifications ?? 0, t),
    unreadMessages: count(options.unreadMessages ?? 0, t),
    ...(viewer.isGuest
      ? {}
      : { notificationsHref: NOTIFICATIONS_HREF, messagesHref: MESSAGES_HREF }),
  }
}

export type PanelKey = 'usercp' | 'modcp' | 'admincp'

const PANELS: readonly {
  readonly key: PanelKey
  readonly messageKey: string
  readonly href: string
}[] = [
  { key: 'usercp', messageKey: 'nav.userCp', href: '/usercp' },
  { key: 'modcp', messageKey: 'nav.modCp', href: '/modcp' },
  { key: 'admincp', messageKey: 'nav.adminCp', href: '/admin' },
]

export function buildPanelLinks(input: {
  readonly current: PanelKey
  readonly canAccessModCp?: boolean
  readonly canAccessAdminCp?: boolean
  readonly t?: Translator
}): readonly LinkModel[] {
  const t = input.t ?? untranslated()
  const reachable: Record<PanelKey, boolean> = {
    usercp: true,
    modcp: input.canAccessModCp === true,
    admincp: input.canAccessAdminCp === true,
  }

  return PANELS.filter((panel) => panel.key !== input.current && reachable[panel.key]).map(
    (panel) => ({ label: t.t(panel.messageKey), href: panel.href }),
  )
}

export function buildFooterModel(
  links: readonly LinkModel[] = [],
  boardTitle: string = BOARD_TITLE,
  zone: string = TIMEZONE_LABEL,
  translator: Translator = untranslated(),
): FooterModel {
  return {
    boardTitle,
    links,
    timezoneLabel: timezoneLabel(zone),
    poweredBy: { label: translator.t('nav.poweredBy'), href: 'https://meith.dev' },
  }
}
