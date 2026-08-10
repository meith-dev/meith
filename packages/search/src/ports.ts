import type { ContentScope } from '@meith/core'

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
  readonly grouping: 'posts' | 'threads'
  readonly sort: 'relevance' | 'newest' | 'oldest'
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

export interface SearchProvider {
  search(query: SearchQuery, scope: SearchScope): Promise<SearchResults>
}
