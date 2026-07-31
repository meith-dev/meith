import type { ContentScope } from '@forum/core'

import type { PostPage, QuotablePost } from './types'

/** SQL-free seam for the thread-view post read (F31). */
export interface PostRepository {
  /**
   * An exact **public** post, used to validate a mark-read target (F32).
   *
   * Deliberately not scoped. Marking a thread read to a post nobody else can
   * see would set a watermark that moves backwards the moment the post is
   * removed, and a moderator's read state is not a different feature from
   * everyone else's.
   */
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
   * One page of a thread's posts, within the scope this actor may see (F47).
   *
   * Required and undefaulted: a caller that has not decided what this viewer
   * may see has not finished authorising, and a default would make the omission
   * invisible — which is precisely the failure this gate exists to make
   * impossible.
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
      readonly scope: ContentScope
    },
  ): Promise<PostPage>
}
