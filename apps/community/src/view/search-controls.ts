import type { Translator } from '@meith/i18n'
import type {
  SearchCursor,
  SearchGrouping,
  SearchMatch,
  SearchPeriod,
  SearchRefinement,
  SearchSort,
} from '@meith/search'
import type { OptionModel } from '@meith/theme-kit'

import { untranslated } from './time'

export const SEARCH_FIELDS = {
  query: 'q',
  forum: 'forum',
  subforums: 'subforums',
  author: 'author',
  period: 'when',
  match: 'in',
  grouping: 'show',
  sort: 'sort',
} as const

export const REFINE_FIELDS = {
  forum: 'forum',
  author: 'by',
  period: 'when',
  match: 'in',
  grouping: 'show',
  sort: 'sort',
} as const

export const CURSOR_FIELDS = { rank: 'rank', after: 'after' } as const

export const SUBFORUMS_ON = 'yes'

export const SORT_LABEL_KEYS: Readonly<Record<SearchSort, string>> = {
  relevance: 'search.sort.relevance',
  newest: 'search.sort.newest',
  oldest: 'search.sort.oldest',
}

export const PERIOD_LABEL_KEYS: Readonly<Record<SearchPeriod, string>> = {
  any: 'search.period.any',
  day: 'search.period.day',
  week: 'search.period.week',
  month: 'search.period.month',
  year: 'search.period.year',
}

export const MATCH_LABEL_KEYS: Readonly<Record<SearchMatch, string>> = {
  everything: 'search.match.everything',
  titles: 'search.match.titles',
}

export const GROUPING_LABEL_KEYS: Readonly<Record<SearchGrouping, string>> = {
  posts: 'search.grouping.posts',
  threads: 'search.grouping.threads',
}

export function choiceOptions<T extends string>(
  values: readonly T[],
  keys: Readonly<Record<T, string>>,
  selected: T,
  t: Translator = untranslated(),
): OptionModel[] {
  return values.map((value) => ({
    value,
    label: t.t(keys[value]),
    isSelected: value === selected,
  }))
}

export function refineParams(refine: SearchRefinement): URLSearchParams {
  const params = new URLSearchParams()

  if (refine.sort !== undefined) params.set(REFINE_FIELDS.sort, refine.sort)
  if (refine.grouping !== undefined) params.set(REFINE_FIELDS.grouping, refine.grouping)
  if (refine.match !== undefined) params.set(REFINE_FIELDS.match, refine.match)
  if (refine.period !== undefined) params.set(REFINE_FIELDS.period, refine.period)

  for (const id of refine.forumIds ?? []) params.append(REFINE_FIELDS.forum, String(id))
  for (const id of refine.authorUserIds ?? []) params.append(REFINE_FIELDS.author, String(id))

  return params
}

export function resultsHref(
  token: string,
  refine: SearchRefinement,
  cursor: SearchCursor | null = null,
): string {
  const params = refineParams(refine)

  if (cursor !== null) {
    params.set(CURSOR_FIELDS.rank, String(cursor.rank))
    params.set(CURSOR_FIELDS.after, String(cursor.postId))
  }

  const query = params.toString()
  return query === '' ? `/search/${token}` : `/search/${token}?${query}`
}
