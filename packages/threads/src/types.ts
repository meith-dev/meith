/** F30's read model. Writes arrive with F39/F40. */
export type ThreadSort = 'activity' | 'rating'

export interface ThreadLastPost {
  readonly postId: number
  readonly userId: number | null
  readonly username: string
  readonly at: Date
}

export interface ThreadListingRow {
  readonly id: number
  readonly communityId: number
  readonly title: string
  readonly slug: string
  readonly prefix: {
    readonly label: string
    readonly token: string | null
  } | null
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly replyCount: number
  readonly viewCount: number
  /** F43's denormalised aggregate, used for the rating listing sort. */
  readonly ratingTotal: number
  readonly ratingCount: number
  /** F47: a moderator's listing shows hidden threads, marked as such. */
  readonly visibility: 'visible' | 'unapproved' | 'deleted'
  readonly isSticky: boolean
  readonly isLocked: boolean
  readonly isMoved: boolean
  readonly lastPost: ThreadLastPost | null
  /** The sort key, retained only for a stable next-page cursor. */
  readonly lastPostAt: Date
}

/** The final row of a page, used to resume the descending listing. */
export interface ThreadCursor {
  readonly sort: ThreadSort
  readonly isSticky: boolean
  readonly lastPostAt: Date
  readonly ratingTotal: number
  readonly ratingCount: number
  readonly id: number
}

export interface ThreadPage {
  readonly rows: readonly ThreadListingRow[]
  readonly nextCursor: ThreadCursor | null
}
