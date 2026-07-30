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
  /** The raw BBCode. Still carried: a stale render is rebuilt from it (F36). */
  readonly message: string
  /**
   * The stored render, and the renderer version that produced it.
   *
   * Read together or not at all — `messageHtml` without `renderVersion` is HTML
   * of unknown provenance, which is the one thing a body must never be. The
   * pair satisfies `RenderablePost` in `@forum/bbcode`; `postBodyHtml` is what
   * decides between them.
   */
  readonly messageHtml: string | null
  readonly renderVersion: number
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
