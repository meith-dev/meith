import type { ContentScope } from '@meith/core'

import type { SearchGrouping, SearchMatch, SearchSort } from './filters'

export interface SearchScope {
  readonly forumIds: readonly number[]
  readonly viewerUserId: number | null
  readonly content: ContentScope
}

export interface SearchQuery {
  readonly terms: string
  readonly authorUserIds?: readonly number[] | undefined
  readonly forumIds?: readonly number[] | undefined
  readonly postedAfter?: Date | undefined
  readonly postedBefore?: Date | undefined
  readonly match: SearchMatch
  readonly grouping: SearchGrouping
  readonly sort: SearchSort
  readonly limit: number
  readonly after: SearchCursor | null
}

export interface SearchCursor {
  readonly rank: number
  readonly postId: number
}

export interface SearchHit {
  readonly postId: number
  readonly threadId: number
  readonly forumId: number
  readonly threadTitle: string
  readonly threadSlug: string
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly postedAt: Date
  readonly excerpt: string
  readonly rank: number
}

export interface SearchResults {
  readonly hits: readonly SearchHit[]
  readonly nextCursor: SearchCursor | null
}

export interface ForumFacet {
  readonly forumId: number
  readonly hits: number
}

export interface AuthorFacet {
  readonly userId: number
  readonly username: string
  readonly hits: number
}

export interface SearchSummary {
  readonly total: number
  readonly isCapped: boolean
  readonly forums: readonly ForumFacet[]
  readonly authors: readonly AuthorFacet[]
}

export interface SearchProvider {
  search(query: SearchQuery, scope: SearchScope): Promise<SearchResults>
  summarize(query: SearchQuery, scope: SearchScope): Promise<SearchSummary>
}
