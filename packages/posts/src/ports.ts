import type { ContentScope } from '@meith/core'

import type { PostPage, QuotablePost } from './types'

export interface PostRepository {
  findVisibleById(threadId: number, postId: number): Promise<number | null>

  findQuotable(threadId: number, postId: number): Promise<QuotablePost | null>

  listThread(
    threadId: number,
    options: {
      readonly afterId?: number
      readonly limit: number
      readonly scope: ContentScope
    },
  ): Promise<PostPage>
}
