import type { ContentScope } from '@meith/core'

import type {
  ThreadCursor,
  ThreadListingRow,
  ThreadPage,
  ThreadSort,
} from './types'

export interface ThreadRepository {
  findById(id: number, scope: ContentScope): Promise<ThreadListingRow | null>

  locateForum(threadId: number): Promise<number | null>

  listForum(
    forumId: number,
    options: {
      readonly after?: ThreadCursor
      readonly limit: number
      readonly scope: ContentScope
      readonly sort?: ThreadSort
    },
  ): Promise<ThreadPage>
}
