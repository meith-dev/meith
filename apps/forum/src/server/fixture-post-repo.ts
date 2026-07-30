import 'server-only'

import type { PostListingRow, PostPage, PostRepository } from '@forum/posts'

import { SEED_POST_ROWS } from './seed-board'

/** Read-only demo posts, matching the keyset contract of the Postgres adapter. */
export class FixturePostRepository implements PostRepository {
  constructor(private readonly rows: readonly PostListingRow[] = SEED_POST_ROWS) {}

  async listThread(
    threadId: number,
    options: { readonly afterId?: number; readonly limit: number },
  ): Promise<PostPage> {
    const matches = this.rows
      .filter((row) => row.threadId === threadId && (options.afterId === undefined || row.id > options.afterId))
      .sort((a, b) => a.id - b.id)
    const page = matches.slice(0, options.limit).map((row) => ({ ...row }))
    const last = page.at(-1)
    return {
      rows: page,
      nextAfterId: matches.length > options.limit && last ? last.id : null,
    }
  }
}
