import 'server-only'

import type { ContentScope } from '@meith/core'
import type {
  ThreadCursor,
  ThreadListingRow,
  ThreadPage,
  ThreadRepository,
  ThreadSort,
} from '@meith/threads'

import { SEED_THREAD_ROWS } from './seed-board'

type ThreadOrderKey = Pick<
  ThreadListingRow,
  'id' | 'isSticky' | 'lastPostAt' | 'ratingTotal' | 'ratingCount'
>

function compare(
  a: ThreadOrderKey,
  b: ThreadOrderKey,
  sort: ThreadSort,
): number {
  const rating =
    sort === 'rating'
      ? b.ratingTotal / (b.ratingCount || 1) -
          a.ratingTotal / (a.ratingCount || 1) || b.ratingCount - a.ratingCount
      : 0
  return (
    Number(b.isSticky) - Number(a.isSticky) ||
    rating ||
    b.lastPostAt.getTime() - a.lastPostAt.getTime() ||
    b.id - a.id
  )
}

function after(
  row: ThreadListingRow,
  cursor: ThreadCursor,
  sort: ThreadSort,
): boolean {
  return compare(row, cursor, sort) > 0
}

/** Read-only demo data. Like the community fixture, it deliberately has no writes. */
export class FixtureThreadRepository implements ThreadRepository {
  constructor(
    private readonly rows: readonly ThreadListingRow[] = SEED_THREAD_ROWS,
  ) {}

  async locateCommunity(threadId: number): Promise<number | null> {
    return this.rows.find((entry) => entry.id === threadId)?.communityId ?? null
  }

  async findById(
    id: number,
    scope: ContentScope,
  ): Promise<ThreadListingRow | null> {
    const row = this.rows.find(
      (entry) => entry.id === id && scope.states.includes(entry.visibility),
    )
    return row ? { ...row } : null
  }

  async listCommunity(
    communityId: number,
    options: {
      readonly after?: ThreadCursor
      readonly limit: number
      readonly scope: ContentScope
      readonly sort?: ThreadSort
    },
  ): Promise<ThreadPage> {
    const sort = options.sort ?? 'activity'
    const matches = this.rows
      .filter(
        (row) =>
          row.communityId === communityId &&
          /* The same predicate the Postgres adapter applies, so a fixture-mode
             leak would be a fixture-mode bug rather than an untested path. */
          options.scope.states.includes(row.visibility) &&
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
