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

export type NavigationOutlineItem = NavigationItemRow & { readonly depth: number }

export function builtInNavigation(key: string | null): BuiltInNavigationItem | null {
  if (key === null) return null
  return BUILT_IN_NAVIGATION.find((item) => item.key === key) ?? null
}

export function defaultNavigationItems(): readonly NavigationItemRow[] {
  return BUILT_IN_NAVIGATION.map((item, index) => ({
    id: index + 1,
    key: item.key,
    parentId: null,
    label: '',
    href: item.href,
    displayOrder: index * 10,
    audience: item.audience,
    newTab: false,
    enabled: true,
    visibleToGroups: [],
  }))
}

/**
 * What a plugin called an item, for the rows the board holds on its behalf.
 * Keyed by the same `plugin.<plugin>.<item>` the row carries.
 */
export interface NavigationName {
  readonly label: string
  readonly labelKey: string | null
  readonly labelArgs?: Parameters<Translator['t']>[1] | null
}

export interface NavigationNames {
  readonly [key: string]: NavigationName
}

export function navigationLabel(
  item: Pick<NavigationItemRow, 'key' | 'label'>,
  t: Translator = untranslated(),
  names: NavigationNames = {},
): string {
  if (item.label.trim() !== '') return item.label

  const builtIn = builtInNavigation(item.key)
  if (builtIn !== null) return t.t(builtIn.messageKey)

  const named = item.key === null ? undefined : names[item.key]
  if (named === undefined) return ''
  if (named.labelKey === null || !t.has(named.labelKey)) return named.label
  return named.labelArgs === null || named.labelArgs === undefined
    ? t.t(named.labelKey)
    : t.t(named.labelKey, named.labelArgs)
}

function inOrder(rows: readonly NavigationItemRow[]): readonly NavigationItemRow[] {
  return [...rows].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)
}

export function outlineOf(rows: readonly NavigationItemRow[]): NavigationOutlineItem[] {
  const sorted = inOrder(rows)
  const outline: NavigationOutlineItem[] = []

  for (const top of sorted.filter((row) => row.parentId === null)) {
    outline.push({ ...top, depth: 0 })
    for (const child of sorted.filter((row) => row.parentId === top.id)) {
      outline.push({ ...child, depth: 1 })
    }
  }

  return outline
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
  readonly names?: NavigationNames
}

export function buildNavigation(
  items: readonly NavigationItemRow[],
  viewer: ViewerModel,
  options: NavigationOptions = {},
): readonly LinkModel[] {
  const t = options.t ?? untranslated()
  const admits = options.admits ?? (() => true)
  const names = options.names ?? {}

  const shown = (item: NavigationItemRow): boolean =>
    item.enabled &&
    !(item.key === SEARCH_KEY && options.searchEnabled === false) &&
    audienceAdmits(item.audience, viewer) &&
    admits(item) &&
    navigationLabel(item, t, names) !== ''

  const linkOf = (item: NavigationItemRow, submenu: readonly LinkModel[]): LinkModel => ({
    label: navigationLabel(item, t, names),
    href: item.href,
    ...(item.newTab ? { newTab: true } : {}),
    ...(submenu.length === 0 ? {} : { submenu }),
  })

  const sorted = inOrder(items)

  return sorted
    .filter((item) => item.parentId === null && shown(item))
    .map((item) =>
      linkOf(
        item,
        sorted
          .filter((child) => child.parentId === item.id && shown(child))
          .map((child) => linkOf(child, [])),
      ),
    )
}
