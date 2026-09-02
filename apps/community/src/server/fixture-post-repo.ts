import 'server-only'

import { type ContentScope, PUBLIC_CONTENT } from '@meith/core'
import type {
  PostListingRow,
  PostLocation,
  PostPage,
  PostRepository,
  QuotablePost,
} from '@meith/posts'

import { SEED_POST_ROWS } from './seed-board'

export class FixturePostRepository implements PostRepository {
  constructor(private readonly rows: readonly PostListingRow[] = SEED_POST_ROWS) {}

  async findRatingTarget(postId: number) {
    const row = this.rows.find((entry) => entry.id === postId)
    return row === undefined
      ? null
      : { id: row.id, threadId: row.threadId, authorUserId: row.authorUserId }
  }

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

  async listRevisions(threadId: number, postId: number) {
    const row = this.rows.find((entry) => entry.threadId === threadId && entry.id === postId)
    if (row === undefined) return []
    return [
      {
        revision: 0,
        message: row.message,
        subject: null,
        editedByUserId: row.authorUserId,
        editedByUsername: row.authorUsername,
        reason: row.editReason,
        createdAt: row.editedAt ?? row.createdAt,
        current: true,
      },
    ]
  }

  async locate(
    threadId: number,
    postId: number,
    options: { readonly scope: ContentScope; readonly pageSize: number },
  ): Promise<PostLocation | null> {
    const size = Math.max(1, Math.trunc(options.pageSize))
    const thread = this.rows
      .filter((row) => row.threadId === threadId && options.scope.states.includes(row.visibility))
      .sort((a, b) => a.id - b.id)

    const index = thread.findIndex((row) => row.id === postId)
    if (index === -1) return null

    const page = Math.floor(index / size) + 1
    return {
      number: index + 1,
      page,
      afterId: page === 1 ? null : (thread[(page - 1) * size - 1]?.id ?? null),
    }
  }

  async locateFirstUnread(
    threadId: number,
    after: { readonly postId: number; readonly since: Date | null },
    options: { readonly scope: ContentScope; readonly pageSize: number },
  ): Promise<PostLocation | null> {
    const first = this.rows
      .filter(
        (row) =>
          row.threadId === threadId &&
          options.scope.states.includes(row.visibility) &&
          row.id > after.postId &&
          (after.since === null || row.createdAt > after.since),
      )
      .sort((a, b) => a.id - b.id)[0]

    return first === undefined ? null : this.locate(threadId, first.id, options)
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
