import type { ContentScope } from '@meith/core'

import type { PostLocation, PostPage, QuotablePost } from './types'

export interface PostRepository {
  findVisibleById(threadId: number, postId: number): Promise<number | null>

  findQuotable(threadId: number, postId: number): Promise<QuotablePost | null>

  locate(
    threadId: number,
    postId: number,
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
