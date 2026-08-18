import type { NavigationAudience, NavigationItemRow } from '@meith/db'
import type { Translator } from '@meith/i18n'
import type { LinkModel, ViewerModel } from '@meith/theme-kit'

import { untranslated } from './time'

export type { NavigationAudience }

export const NAVIGATION_AUDIENCE_MESSAGE_KEYS: Readonly<Record<NavigationAudience, string>> = {
  all: 'adminNavigation.audience.all',
  guests: 'adminNavigation.audience.guests',
  members: 'adminNavigation.audience.members',
  staff: 'adminNavigation.audience.staff',
}

export const NAVIGATION_AUDIENCE_VALUES = Object.keys(
  NAVIGATION_AUDIENCE_MESSAGE_KEYS,
) as readonly NavigationAudience[]

export interface BuiltInNavigationItem {
  readonly key: string
  readonly messageKey: string
  readonly href: string
  readonly audience: NavigationAudience
}

export const BUILT_IN_NAVIGATION: readonly BuiltInNavigationItem[] = [
  { key: 'home', messageKey: 'nav.home', href: '/', audience: 'all' },
  { key: 'new-posts', messageKey: 'nav.newPosts', href: '/discover/new', audience: 'all' },
  {
    key: 'unanswered',
    messageKey: 'nav.unanswered',
    href: '/discover/unanswered',
    audience: 'all',
  },
  {
    key: 'my-posts',
    messageKey: 'nav.myPosts',
    href: '/discover/participated',
    audience: 'members',
  },
  { key: 'search', messageKey: 'nav.search', href: '/search', audience: 'all' },
  { key: 'online', messageKey: 'nav.online', href: '/online', audience: 'all' },
]

const SEARCH_KEY = 'search'

export function builtInNavigation(key: string | null): BuiltInNavigationItem | null {
  if (key === null) return null
  return BUILT_IN_NAVIGATION.find((item) => item.key === key) ?? null
}

export function defaultNavigationItems(): readonly NavigationItemRow[] {
  return BUILT_IN_NAVIGATION.map((item, index) => ({
    id: index + 1,
    key: item.key,
    label: '',
    href: item.href,
    displayOrder: index * 10,
    audience: item.audience,
    newTab: false,
    enabled: true,
    visibleToGroups: [],
  }))
}

export function navigationLabel(
  item: Pick<NavigationItemRow, 'key' | 'label'>,
  t: Translator = untranslated(),
): string {
  if (item.label.trim() !== '') return item.label

  const builtIn = builtInNavigation(item.key)
  return builtIn === null ? '' : t.t(builtIn.messageKey)
}

function isStaff(viewer: ViewerModel): boolean {
  return viewer.canAccessAdminCp || viewer.canAccessModCp
}

export function audienceAdmits(audience: NavigationAudience, viewer: ViewerModel): boolean {
  if (audience === 'guests') return viewer.isGuest
  if (audience === 'members') return !viewer.isGuest
  if (audience === 'staff') return isStaff(viewer)
  return true
}

export interface NavigationOptions {
  readonly searchEnabled?: boolean
  readonly t?: Translator
  readonly admits?: (item: NavigationItemRow) => boolean
}

export function buildNavigation(
  items: readonly NavigationItemRow[],
  viewer: ViewerModel,
  options: NavigationOptions = {},
): readonly LinkModel[] {
  const t = options.t ?? untranslated()
  const admits = options.admits ?? (() => true)

  return items
    .filter((item) => item.enabled)
    .filter((item) => !(item.key === SEARCH_KEY && options.searchEnabled === false))
    .filter((item) => audienceAdmits(item.audience, viewer))
    .filter((item) => admits(item))
    .map((item) => ({
      label: navigationLabel(item, t),
      href: item.href,
      ...(item.newTab ? { newTab: true } : {}),
    }))
    .filter((link) => link.label !== '')
}
