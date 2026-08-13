import type { SearchResultsModel } from '@meith/theme-kit'

import { postLink } from './post-link'
import { formatTime } from './time'

export interface SearchHitRow {
  readonly postId: number
  readonly threadId: number
  readonly threadTitle: string
  readonly threadSlug: string
  readonly authorUsername: string
  readonly postedAt: Date
  readonly excerpt: string
}

export function buildSearchResultsView(input: {
  readonly terms: string
  readonly createdAt: Date
  readonly hits: readonly SearchHitRow[]
  readonly nextHref: string | null
  readonly pageSize: number
  readonly now: Date
  readonly timeZone?: string | undefined
}): SearchResultsModel {
  return {
    terms: input.terms,
    searchedAt: formatTime(input.createdAt, input.now, input.timeZone),
    hits: input.hits.map((hit) => ({
      postId: hit.postId,
      threadTitle: hit.threadTitle,
      href: postLink(`/thread/${hit.threadId}-${hit.threadSlug}`, hit.postId),
      excerptHtml: hit.excerpt,
      authorUsername: hit.authorUsername,
      postedAt: formatTime(hit.postedAt, input.now, input.timeZone),
    })),
    nextHref: input.nextHref,
    nextLabel: `Next ${input.pageSize} results`,
    newSearchHref: '/search',
    within: {
      action: '/search',
      field: 'q',
      value: `${input.terms} `,
      label: 'Search within these results',
      hint: 'Adds your words to the ones above. Everything already typed stays.',
      submitLabel: 'Search within',
    },
  }
}
