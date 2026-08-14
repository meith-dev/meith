export const SEARCH_SORTS = ['relevance', 'newest', 'oldest'] as const

export type SearchSort = (typeof SEARCH_SORTS)[number]

export const SEARCH_MATCHES = ['everything', 'titles'] as const

export type SearchMatch = (typeof SEARCH_MATCHES)[number]

export const SEARCH_GROUPINGS = ['posts', 'threads'] as const

export type SearchGrouping = (typeof SEARCH_GROUPINGS)[number]

export const SEARCH_PERIODS = ['any', 'day', 'week', 'month', 'year'] as const

export type SearchPeriod = (typeof SEARCH_PERIODS)[number]

const PERIOD_DAYS: Readonly<Record<SearchPeriod, number | null>> = {
  any: null,
  day: 1,
  week: 7,
  month: 30,
  year: 365,
}

const DAY_MS = 24 * 60 * 60 * 1000

function member<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

export function readSort(value: unknown): SearchSort {
  return member(SEARCH_SORTS, value, 'relevance')
}

export function readMatch(value: unknown): SearchMatch {
  return member(SEARCH_MATCHES, value, 'everything')
}

export function readGrouping(value: unknown): SearchGrouping {
  return member(SEARCH_GROUPINGS, value, 'posts')
}

export function readPeriod(value: unknown): SearchPeriod {
  return member(SEARCH_PERIODS, value, 'any')
}

export function periodStart(period: SearchPeriod, now: Date): Date | null {
  const days = PERIOD_DAYS[period]
  return days === null ? null : new Date(now.getTime() - days * DAY_MS)
}

export function narrowerPeriod(a: SearchPeriod, b: SearchPeriod): SearchPeriod {
  const left = PERIOD_DAYS[a]
  const right = PERIOD_DAYS[b]
  if (left === null) return b
  if (right === null) return a
  return left <= right ? a : b
}

export function narrowerMatch(a: SearchMatch, b: SearchMatch): SearchMatch {
  return a === 'titles' || b === 'titles' ? 'titles' : 'everything'
}

export function narrowerIds(
  a: readonly number[] | undefined,
  b: readonly number[] | undefined,
): readonly number[] | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return a.filter((id) => b.includes(id))
}

export interface SearchFilterSet {
  readonly sort: SearchSort
  readonly match: SearchMatch
  readonly grouping: SearchGrouping
  readonly period: SearchPeriod
  readonly forumIds?: readonly number[] | undefined
  readonly authorUserIds?: readonly number[] | undefined
  readonly authorNames?: readonly string[] | undefined
}

export interface SearchRefinement {
  readonly sort?: SearchSort | undefined
  readonly match?: SearchMatch | undefined
  readonly grouping?: SearchGrouping | undefined
  readonly period?: SearchPeriod | undefined
  readonly forumIds?: readonly number[] | undefined
  readonly authorUserIds?: readonly number[] | undefined
}

export function isRefined(refine: SearchRefinement): boolean {
  return Object.values(refine).some((value) => value !== undefined)
}

export function trimRefinement(
  refine: SearchRefinement,
  filters: SearchFilterSet,
): SearchRefinement {
  const same = (a: readonly number[] | undefined, b: readonly number[] | undefined): boolean =>
    a !== undefined &&
    b !== undefined &&
    a.length === b.length &&
    a.every((id) => b.includes(id))

  return {
    ...(refine.sort === undefined || refine.sort === filters.sort ? {} : { sort: refine.sort }),
    ...(refine.grouping === undefined || refine.grouping === filters.grouping
      ? {}
      : { grouping: refine.grouping }),
    ...(refine.match === undefined || refine.match === filters.match
      ? {}
      : { match: refine.match }),
    ...(refine.period === undefined || refine.period === filters.period
      ? {}
      : { period: refine.period }),
    ...(refine.forumIds === undefined || same(refine.forumIds, filters.forumIds)
      ? {}
      : { forumIds: refine.forumIds }),
    ...(refine.authorUserIds === undefined || same(refine.authorUserIds, filters.authorUserIds)
      ? {}
      : { authorUserIds: refine.authorUserIds }),
  }
}

export function narrowFilters(
  filters: SearchFilterSet,
  refine: SearchRefinement,
): SearchFilterSet {
  const forumIds = narrowerIds(filters.forumIds, refine.forumIds)
  const authorUserIds = narrowerIds(filters.authorUserIds, refine.authorUserIds)

  return {
    sort: refine.sort ?? filters.sort,
    grouping: refine.grouping ?? filters.grouping,
    match: narrowerMatch(filters.match, refine.match ?? 'everything'),
    period: narrowerPeriod(filters.period, refine.period ?? 'any'),
    ...(forumIds === undefined ? {} : { forumIds }),
    ...(authorUserIds === undefined ? {} : { authorUserIds }),
    ...(filters.authorNames === undefined ? {} : { authorNames: filters.authorNames }),
  }
}
