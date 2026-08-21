export interface PostListingRow {
  readonly id: number
  readonly threadId: number
  readonly forumId: number
  readonly number: number
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly authorPostCount: number
  readonly authorJoinedAt: Date | null
  readonly message: string
  readonly messageHtml: string | null
  readonly renderVersion: number
  readonly bodyFormat: number
  readonly isFirstPost: boolean
  readonly visibility: 'visible' | 'unapproved' | 'deleted'
  readonly createdAt: Date

  readonly editedAt: Date | null
  readonly editedByUsername: string | null
  readonly editReason: string | null
}

export interface PostPage {
  readonly rows: readonly PostListingRow[]
  readonly nextAfterId: number | null
}

export interface PostLocation {
  /** Position in the thread, 1-based, in the reader's own scope. */
  readonly number: number
  readonly page: number
  /** The cursor that opens that page, or `null` for the first. */
  readonly afterId: number | null
}

export interface QuotablePost {
  readonly id: number
  readonly authorUsername: string
  readonly message: string
}

export interface PostRatingTarget {
  readonly id: number
  readonly threadId: number
  readonly authorUserId: number | null
}
