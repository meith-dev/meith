import 'server-only'

import { PUBLIC_CONTENT, type ContentScope } from '@meith/core'
import type {
  PostListingRow,
  PostPage,
  PostRepository,
  QuotablePost,
} from '@meith/posts'

import { SEED_POST_ROWS } from './seed-board'

/** Read-only demo posts, matching the keyset contract of the Postgres adapter. */
export class FixturePostRepository implements PostRepository {
  constructor(private readonly rows: readonly PostListingRow[] = SEED_POST_ROWS) {}

  async findVisibleById(threadId: number, postId: number): Promise<number | null> {
    return this.rows.some(
      (row) =>
        row.threadId === threadId &&
        row.id === postId &&
        PUBLIC_CONTENT.states.includes(row.visibility),
    )
      ? postId
      : null
  }

  async findQuotable(threadId: number, postId: number): Promise<QuotablePost | null> {
    const row = this.rows.find(
      (entry) =>
        entry.threadId === threadId &&
        entry.id === postId &&
        PUBLIC_CONTENT.states.includes(entry.visibility),
    )
    return row === undefined
      ? null
      : { id: row.id, authorUsername: row.authorUsername, message: row.message }
  }

  async listThread(
    threadId: number,
    options: {
      readonly afterId?: number
      readonly limit: number
      readonly scope: ContentScope
    },
  ): Promise<PostPage> {
    const matches = this.rows
      .filter(
        (row) =>
          row.threadId === threadId &&
          options.scope.states.includes(row.visibility) &&
          (options.afterId === undefined || row.id > options.afterId),
      )
      .sort((a, b) => a.id - b.id)
    const page = matches.slice(0, options.limit).map((row) => ({ ...row }))
    const last = page.at(-1)
    return {
      rows: page,
      nextAfterId: matches.length > options.limit && last ? last.id : null,
    }
  }
}
