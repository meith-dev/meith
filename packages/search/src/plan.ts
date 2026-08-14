import { periodStart, type SearchFilterSet } from './filters'
import type { SearchCursor, SearchQuery } from './ports'

export function searchQueryFrom(
  terms: string,
  filters: SearchFilterSet,
  page: {
    readonly limit: number
    readonly after: SearchCursor | null
    readonly now: Date
  },
): SearchQuery {
  const postedAfter = periodStart(filters.period, page.now)

  return {
    terms,
    match: filters.match,
    grouping: filters.grouping,
    sort: filters.sort,
    limit: page.limit,
    after: page.after,
    ...(filters.forumIds === undefined ? {} : { forumIds: filters.forumIds }),
    ...(filters.authorUserIds === undefined ? {} : { authorUserIds: filters.authorUserIds }),
    ...(postedAfter === null ? {} : { postedAfter }),
  }
}
