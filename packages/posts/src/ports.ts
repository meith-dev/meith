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

  listThread(
    threadId: number,
    options: { readonly afterId?: number; readonly limit: number },
  ): Promise<PostPage>
}
