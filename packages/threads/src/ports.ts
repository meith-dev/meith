import type { ContentScope } from '@meith/core'

import type {
  ThreadCursor,
  ThreadListingRow,
  ThreadPage,
  ThreadSort,
} from './types'

/** SQL-free seam for the forum-display read (F30). */
export interface ThreadRepository {
  /**
   * A thread by its stable id, within the scope this actor may see (F47).
   *
   * The scope is not optional and has no default: a caller that has not decided
   * what this viewer may see has not finished authorising, and a default would
   * make the omission invisible.
   */
  findById(id: number, scope: ContentScope): Promise<ThreadListingRow | null>

  /**
   * Which forum a thread is in, whatever state the thread is in.
   *
   * The one lookup that is deliberately unscoped, and it returns an id and
   * nothing else. It exists because the scope cannot be built before the forum
   * is known and the forum cannot be known before the thread is found — so
   * either something reads the thread unscoped, or this reads the single field
   * that resolving permissions actually needs. A forum id is not content: it
   * confirms nothing a reader could not learn by being refused, and the
   * `thread.view` check that follows is what decides whether they learn even
   * that.
   */
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
