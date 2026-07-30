/** F31's visible-post read model. Posting commands start at F39/F40. */
export interface PostListingRow {
  readonly id: number
  readonly threadId: number
  readonly forumId: number
  /** Position among visible posts in the thread, 1-based. */
  readonly number: number
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly authorPostCount: number
  readonly authorJoinedAt: Date | null
  readonly message: string
  readonly isFirstPost: boolean
  readonly visibility: 'visible'
  readonly createdAt: Date
}

export interface PostPage {
  readonly rows: readonly PostListingRow[]
  readonly nextAfterId: number | null
}

/** The subset a quote needs (F40). Never the whole listing row. */
export interface QuotablePost {
  readonly id: number
  readonly authorUsername: string
  readonly message: string
}
