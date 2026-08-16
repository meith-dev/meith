import type { ContentScope, ThreadAuthorFilter } from '@meith/core'

import type {
  ThreadCursor,
  ThreadListingRow,
  ThreadPage,
  ThreadSort,
} from './types'

export interface ThreadLocation {
  readonly forumId: number
  readonly authorUserId: number | null
}

export interface ThreadRepository {
  findById(
    id: number,
    scope: ContentScope,
    authors: ThreadAuthorFilter,
  ): Promise<ThreadListingRow | null>

  locate(threadId: number): Promise<ThreadLocation | null>

  listForum(
    forumId: number,
    options: {
      readonly after?: ThreadCursor
      readonly offset?: number
      readonly limit: number
      readonly scope: ContentScope
      readonly authors: ThreadAuthorFilter
      readonly sort?: ThreadSort
    },
  ): Promise<ThreadPage>
}
