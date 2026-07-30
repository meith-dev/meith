import type { PostPage, QuotablePost } from './types'

/** SQL-free seam for the thread-view post read (F31). */
export interface PostRepository {
  /** An exact visible post, used to validate a mark-read target (F32). */
  findVisibleById(threadId: number, postId: number): Promise<number | null>

  /**
   * A visible post's author and body, for F40's quote prefill.
   *
   * Scoped to a thread on purpose: a quote is only ever of a post in the thread
   * being replied to, and taking the thread as part of the lookup means
   * `?quote=<id>` cannot paste a post out of a forum the quoter may not read.
   */
  findQuotable(threadId: number, postId: number): Promise<QuotablePost | null>

  /**
   * One page of a thread's posts.
   *
   * The two `include` flags widen the read, and they are two rather than one
   * because `content.viewDeleted` and `content.viewUnapproved` are two
   * permissions: a role that reviews the queue is not automatically a role that
   * reads what was removed. They are the caller's decision — resolved from the
   * matrix, never inferred here.
   *
   * Post numbering follows whichever set the reader is shown, so a moderator's
   * "#4" can differ from a member's. The alternative is gaps in the numbering,
   * which reads as a bug on every thread that has ever been moderated.
   */
  listThread(
    threadId: number,
    options: {
      readonly afterId?: number
      readonly limit: number
      readonly includeDeleted?: boolean
      readonly includeUnapproved?: boolean
    },
  ): Promise<PostPage>
}
