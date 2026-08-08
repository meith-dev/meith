/**
 * F72 — the search provider seam.
 *
 * A board's search is the feature most likely to be replaced: Postgres
 * full-text search is the right default — it needs no second service, it is
 * transactional with the content, and it is good enough for the overwhelming
 * majority of boards — but a large one may eventually want Elasticsearch,
 * Typesense or a hosted index. That decision must not require rewriting the
 * search *screens*, so everything above this interface speaks in queries and
 * hits rather than in `tsquery`.
 *
 * The seam is narrow on purpose. Anything a provider cannot be expected to do
 * portably — ranking internals, index maintenance, stemming configuration —
 * stays behind it and is not part of the contract.
 */

import type { ContentScope } from '@meith/core'

/** What a viewer is allowed to see, resolved before the query runs. */
export interface SearchScope {
  /**
   * The communities this viewer may search, already resolved by the Authorizer.
   *
   * **An empty array means "nothing", never "everything".** That distinction is
   * the whole reason this is a required field rather than an optional filter: a
   * provider that treated an absent scope as unrestricted would turn a
   * permission failure into a full-board search, which is exactly the leak this
   * feature must not have.
   */
  readonly communityIds: readonly number[]
  /** The viewer, for future own-content rules. Null for a guest. */
  readonly viewerUserId: number | null
  /**
   * Which content states this viewer may see (F47).
   *
   * A `ContentScope` rather than a "staff?" boolean, because naming states is
   * something exactly one module in this codebase is allowed to do — every read
   * path takes a scope and turns it into SQL through `visibleIn`, and the guard
   * fails the build for anything else. A provider that decided for itself what
   * "hidden" means would be the twentieth read path shipping without one.
   */
  readonly content: ContentScope
}

export interface SearchQuery {
  /** What the member typed. Never a query language — see `parseSearchInput`. */
  readonly terms: string
  /** Restrict to threads started by, or posts written by, these members. */
  readonly authorUserIds?: readonly number[] | undefined
  /** Restrict further than the scope allows — never wider. */
  readonly communityIds?: readonly number[] | undefined
  readonly postedAfter?: Date | undefined
  readonly postedBefore?: Date | undefined
  /** `posts` returns individual posts; `threads` collapses to one hit each. */
  readonly grouping: 'posts' | 'threads'
  readonly sort: 'relevance' | 'newest' | 'oldest'
  readonly limit: number
  /** Keyset cursor from a previous page, or null to start. */
  readonly after: SearchCursor | null
}

/**
 * Where a page of results stopped.
 *
 * Rank *and* id, because ranks tie constantly — a hundred posts can share a
 * score — and paging on rank alone would skip or repeat the tied ones. The id
 * breaks the tie and makes the order total.
 */
export interface SearchCursor {
  readonly rank: number
  readonly postId: number
}

export interface SearchHit {
  readonly postId: number
  readonly threadId: number
  readonly communityId: number
  readonly threadTitle: string
  readonly threadSlug: string
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly postedAt: Date
  /** A short extract with the matched terms marked, provider-rendered. */
  readonly excerpt: string
  readonly rank: number
}

export interface SearchResults {
  readonly hits: readonly SearchHit[]
  /** Pass back as `after`. Null when the last page has been reached. */
  readonly nextCursor: SearchCursor | null
}

export interface SearchProvider {
  search(query: SearchQuery, scope: SearchScope): Promise<SearchResults>
}
