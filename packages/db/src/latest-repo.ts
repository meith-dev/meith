/**
 * The board index's two "what just happened" lists.
 *
 * Newest threads and newest posts, board-wide, permission-filtered in SQL. They
 * sit beside F74's discovery views rather than inside them for a reason that
 * file states in its own header: those are **thread** listings, deliberately,
 * because "what is new" is a question about conversations. Half of this is a
 * post listing, and folding it in would have made that paragraph a lie.
 *
 * ## They answer two different questions, which is why there are two
 *
 * `threads` is ordered by creation and `posts` by creation, so the pair reads as
 * "what has been started" and "what is being said". Ordering the first by
 * activity instead — which is what a feed does — would make both panels the same
 * list twice, with the second one merely more granular.
 *
 * ## Why the order is `id desc` rather than `created_at desc`
 *
 * They are the same order and one of them is free. Ids on both tables are
 * assigned in insertion order, so the primary key already *is* the creation
 * index — a backward scan on it reaches the newest N rows without a sort and
 * without an index nothing else on this board would use. `created_at` would
 * need one, and would tie on a busy board in the one place ties are worst: the
 * top of a list somebody is watching refresh.
 *
 * The rows are still stamped with `created_at`, because a reader wants the time
 * and not the id.
 *
 * ## The scope is the reader's, and an empty one means nothing
 *
 * The same rule as every other cross-board listing here (F72's search, F74's
 * discovery): filtering after the fetch returns five rows as one and calls it a
 * page. An empty forum list short-circuits before a statement runs — a version
 * that omitted the clause for an empty list would show the whole board to
 * exactly the reader who may see none of it.
 */
import { sql } from 'drizzle-orm'

import type { ContentScope } from '@meith/core'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { visibleIn } from './visibility'

export interface LatestScope {
  /** Forums this reader may see, from `Authorizer.forumIdsWhere` (F47). */
  readonly forumIds: readonly number[]
  readonly content: ContentScope
}

export interface LatestThreadRow {
  readonly threadId: number
  readonly title: string
  readonly slug: string
  readonly forumId: number
  readonly forumTitle: string
  readonly forumSlug: string
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly replyCount: number
  readonly createdAt: Date
}

export interface LatestPostRow {
  readonly postId: number
  readonly threadId: number
  readonly threadTitle: string
  readonly threadSlug: string
  readonly forumId: number
  readonly forumTitle: string
  readonly forumSlug: string
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly createdAt: Date
  /** The post's Markdown source, cut server-side. Flattened by the caller. */
  readonly messageSource: string
}

/**
 * How much of a post travels for a two-line excerpt.
 *
 * Cut in SQL rather than in JavaScript: a sidebar showing five posts must not
 * pull five whole post bodies across the wire to throw most of each away, and
 * on a board where somebody has pasted a stack trace that is the difference
 * between a small query and a large one.
 */
const EXCERPT_CHARS = 300

export class PostgresLatestRepository {
  constructor(private readonly db: Database) {}

  /**
   * The newest threads on the board.
   *
   * The forum is carried on every row because these lists cross the whole
   * board: without it two identically-titled threads in two forums are the same
   * row twice. It comes from the same statement, not a lookup per row.
   */
  async threads(limit: number, scope: LatestScope): Promise<readonly LatestThreadRow[]> {
    if (scope.forumIds.length === 0) return []

    const rows = resultRows(
      await this.db.execute(sql`
        select t.id, t.title, t.slug, t.forum_id, f.title as forum_title,
               f.slug as forum_slug, t.author_user_id, t.author_username,
               t.reply_count, t.created_at
          from threads t
          join forums f on f.id = t.forum_id
         where t.forum_id in (${sql.join(
           scope.forumIds.map((id) => sql`${id}`),
           sql`, `,
         )})
           and ${visibleIn(sql`t.visibility`, scope.content)}
         order by t.id desc
         limit ${limit}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      threadId: Number(row.id),
      title: String(row.title),
      slug: String(row.slug),
      forumId: Number(row.forum_id),
      forumTitle: String(row.forum_title),
      forumSlug: String(row.forum_slug),
      authorUserId: row.author_user_id === null ? null : Number(row.author_user_id),
      authorUsername: String(row.author_username),
      replyCount: Number(row.reply_count),
      createdAt: toDate(row.created_at),
    }))
  }

  /**
   * The newest posts on the board.
   *
   * **Both visibilities are checked**, the post's and its thread's. A visible
   * reply in a thread a moderator has removed is still removed content, and a
   * panel that asked only about the post would put it back on the front page —
   * with a link, an author and an excerpt.
   *
   * The forum scope is applied to `threads` rather than to `posts.forum_id`,
   * even though the denormalised column exists and F51 rewrites it on a move.
   * One source of truth for "which forum is this in" is worth more than the
   * column saving a join that the thread title needs anyway; the day the two
   * disagree, this reads the one every other permission check reads.
   */
  async posts(limit: number, scope: LatestScope): Promise<readonly LatestPostRow[]> {
    if (scope.forumIds.length === 0) return []

    const rows = resultRows(
      await this.db.execute(sql`
        select p.id, p.thread_id, p.author_user_id, p.author_username, p.created_at,
               left(p.message, ${EXCERPT_CHARS}) as message,
               t.title as thread_title, t.slug as thread_slug,
               t.forum_id, f.title as forum_title, f.slug as forum_slug
          from posts p
          join threads t on t.id = p.thread_id
          join forums f on f.id = t.forum_id
         where t.forum_id in (${sql.join(
           scope.forumIds.map((id) => sql`${id}`),
           sql`, `,
         )})
           and ${visibleIn(sql`t.visibility`, scope.content)}
           and ${visibleIn(sql`p.visibility`, scope.content)}
         order by p.id desc
         limit ${limit}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      postId: Number(row.id),
      threadId: Number(row.thread_id),
      threadTitle: String(row.thread_title),
      threadSlug: String(row.thread_slug),
      forumId: Number(row.forum_id),
      forumTitle: String(row.forum_title),
      forumSlug: String(row.forum_slug),
      authorUserId: row.author_user_id === null ? null : Number(row.author_user_id),
      authorUsername: String(row.author_username),
      createdAt: toDate(row.created_at),
      messageSource: String(row.message),
    }))
  }
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value))
}
