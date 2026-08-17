import 'server-only'

import { authorFilterAdmits, type ContentScope, type ThreadAuthorFilter } from '@meith/core'
import type {
  ThreadCursor,
  ThreadListingRow,
  ThreadLocation,
  ThreadPage,
  ThreadRepository,
  ThreadSort,
} from '@meith/threads'

import { SEED_THREAD_ROWS } from './seed-board'

type ThreadOrderKey = Pick<
  ThreadListingRow,
  'id' | 'isSticky' | 'lastPostAt' | 'ratingTotal' | 'ratingCount'
>

function compare(a: ThreadOrderKey, b: ThreadOrderKey, sort: ThreadSort): number {
  const rating =
    sort === 'rating'
      ? b.ratingTotal / (b.ratingCount || 1) - a.ratingTotal / (a.ratingCount || 1) ||
        b.ratingCount - a.ratingCount
      : 0
  return (
    Number(b.isSticky) - Number(a.isSticky) ||
    rating ||
    b.lastPostAt.getTime() - a.lastPostAt.getTime() ||
    b.id - a.id
  )
}

function after(row: ThreadListingRow, cursor: ThreadCursor, sort: ThreadSort): boolean {
  return compare(row, cursor, sort) > 0
}

export class FixtureThreadRepository implements ThreadRepository {
  constructor(private readonly rows: readonly ThreadListingRow[] = SEED_THREAD_ROWS) {}

  async locate(threadId: number): Promise<ThreadLocation | null> {
    const row = this.rows.find((entry) => entry.id === threadId)
    return row === undefined ? null : { forumId: row.forumId, authorUserId: row.authorUserId }
  }

  async findById(
    id: number,
    scope: ContentScope,
    authors: ThreadAuthorFilter,
  ): Promise<ThreadListingRow | null> {
    const row = this.rows.find(
      (entry) =>
        entry.id === id &&
        scope.states.includes(entry.visibility) &&
        authorFilterAdmits(authors, entry.authorUserId),
    )
    return row ? { ...row } : null
  }

  async listForum(
    forumId: number,
    options: {
      readonly after?: ThreadCursor
      readonly limit: number
      readonly scope: ContentScope
      readonly authors: ThreadAuthorFilter
      readonly sort?: ThreadSort
    },
  ): Promise<ThreadPage> {
    const sort = options.sort ?? 'activity'
    const matches = this.rows
      .filter(
        (row) =>
          row.forumId === forumId &&
          options.scope.states.includes(row.visibility) &&
          authorFilterAdmits(options.authors, row.authorUserId) &&
          (!options.after || after(row, options.after, sort)),
      )
      .sort((a, b) => compare(a, b, sort))
    const page = matches.slice(0, options.limit).map((row) => ({ ...row }))
    const last = page.at(-1)

    return {
      rows: page,
      nextCursor:
        matches.length > options.limit && last
          ? {
              sort,
              isSticky: last.isSticky,
              lastPostAt: last.lastPostAt,
              ratingTotal: last.ratingTotal,
              ratingCount: last.ratingCount,
              id: last.id,
            }
          : null,
    }
  }
}
