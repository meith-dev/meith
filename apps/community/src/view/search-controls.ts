import type {
  SearchCursor,
  SearchGrouping,
  SearchMatch,
  SearchPeriod,
  SearchRefinement,
  SearchSort,
} from '@meith/search'
import type { OptionModel } from '@meith/theme-kit'

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

export const SORT_LABELS: Readonly<Record<SearchSort, string>> = {
  relevance: 'Best match',
  newest: 'Newest first',
  oldest: 'Oldest first',
}

export const PERIOD_LABELS: Readonly<Record<SearchPeriod, string>> = {
  any: 'Any time',
  day: 'Past 24 hours',
  week: 'Past week',
  month: 'Past month',
  year: 'Past year',
}

export const MATCH_LABELS: Readonly<Record<SearchMatch, string>> = {
  everything: 'Titles and post text',
  titles: 'Thread titles only',
}

export const GROUPING_LABELS: Readonly<Record<SearchGrouping, string>> = {
  posts: 'Every matching post',
  threads: 'One row per thread',
}

export function choiceOptions<T extends string>(
  values: readonly T[],
  labels: Readonly<Record<T, string>>,
  selected: T,
): OptionModel[] {
  return values.map((value) => ({
    value,
    label: labels[value],
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
