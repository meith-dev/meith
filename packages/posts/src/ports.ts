import type { ContentScope } from '@meith/core'

import type { PostLocation, PostPage, PostRatingTarget, PostRevision, QuotablePost } from './types'

export interface PostRepository {
  findRatingTarget(postId: number): Promise<PostRatingTarget | null>

  findVisibleById(threadId: number, postId: number): Promise<number | null>

  findQuotable(threadId: number, postId: number): Promise<QuotablePost | null>

  listRevisions(threadId: number, postId: number): Promise<readonly PostRevision[]>

  locate(
    threadId: number,
    postId: number,
    options: { readonly scope: ContentScope; readonly pageSize: number },
  ): Promise<PostLocation | null>

  locateFirstUnread(
    threadId: number,
    after: { readonly postId: number; readonly since: Date | null },
    options: { readonly scope: ContentScope; readonly pageSize: number },
  ): Promise<PostLocation | null>

  listThread(
    threadId: number,
    options: {
      readonly afterId?: number
      readonly offset?: number
      readonly limit: number
      readonly scope: ContentScope
    },
  ): Promise<PostPage>
}
