export type ThreadSort = 'activity' | 'rating'

export interface ThreadLastPost {
  readonly postId: number
  readonly userId: number | null
  readonly username: string
  readonly at: Date
}

export interface ThreadListingRow {
  readonly id: number
  readonly forumId: number
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
  readonly ratingTotal: number
  readonly ratingCount: number
  readonly visibility: 'visible' | 'unapproved' | 'deleted'
  readonly isSticky: boolean
  readonly isLocked: boolean
  readonly isMoved: boolean
  readonly lastPost: ThreadLastPost | null
  readonly lastPostAt: Date
}

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
