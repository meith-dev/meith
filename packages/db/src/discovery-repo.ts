/**
 * F74 — the discovery views: New, Today, My, Unanswered.
 *
 * Four questions members ask constantly, and one shape that answers all of
 * them: **one query, permission-filtered in SQL, keyset-paged.**
 *
 * The permission filter is the same rule F72's search follows and for the same
 * reason — filtering a fetched page returns twenty threads as three and
 * computes the cursor from rows the viewer cannot see. An empty scope means no
 * results, never all of them.
 *
 * They are *thread* listings rather than post listings, deliberately. "What is
 * new" is a question about conversations: a thread with forty new replies is
 * one row a member wants, not forty. The exception is "my posts", where the
 * unit of interest genuinely is the post — somebody is looking for a thing they
 * wrote.
 *
 * Every one is a single statement. The budget test in `@meith/testkit` holds
 * that, because an N+1 here does not fail — it passes slowly, on an empty
 * board, and falls over on a real one.
 */
import { sql, type SQL } from 'drizzle-orm'

import type { ContentScope } from '@meith/core'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { visibleIn } from './visibility'

export interface DiscoveryScope {
  /** Communities this viewer may see, from `Authorizer.communityIdsWhere` (F47). */
  readonly communityIds: readonly number[]
  readonly content: ContentScope
  readonly viewerUserId: number | null
}

export interface DiscoveryRow {
  readonly threadId: number
  readonly communityId: number
  readonly communityTitle: string
  readonly communitySlug: string
  readonly title: string
  readonly slug: string
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly replyCount: number
  readonly lastPostAt: Date
  readonly lastPostUsername: string | null
}

export interface DiscoveryPage {
  readonly rows: readonly DiscoveryRow[]
  /** Keyset cursor: the last thread's `last_post_at` and id. */
  readonly nextCursor: { readonly at: Date; readonly threadId: number } | null
}

export interface DiscoveryQuery {
  readonly limit: number
  readonly after: { readonly at: Date; readonly threadId: number } | null
}

export class PostgresDiscoveryRepository {
  constructor(private readonly db: Database) {}

  /**
   * Threads with activity since a moment — "new to me" and "today" alike.
   *
   * One function rather than two, because they differ only in which instant is
   * passed: "today" is midnight in the viewer's zone, "new" is their last
   * visit. Two functions would be two places for the paging and the permission
   * filter to drift apart.
   */
  async activeSince(
    since: Date,
    query: DiscoveryQuery,
    scope: DiscoveryScope,
  ): Promise<DiscoveryPage> {
    return this.page([sql`t.last_post_at >= ${since}`], query, scope)
  }

  /**
   * Threads nobody has replied to.
   *
   * `reply_count = 0` rather than "one post", because a thread whose only reply
   * was deleted is unanswered again — and the counter is the board's own answer
   * to that, maintained by F38 and repaired by its recount. Counting posts here
   * would be a second opinion that drifts from the one every other screen shows.
   */
  async unanswered(query: DiscoveryQuery, scope: DiscoveryScope): Promise<DiscoveryPage> {
    return this.page([sql`t.reply_count = 0`], query, scope)
  }

  /** Threads this member started. */
  async startedBy(
    userId: number,
    query: DiscoveryQuery,
    scope: DiscoveryScope,
  ): Promise<DiscoveryPage> {
    return this.page([sql`t.author_user_id = ${userId}`], query, scope)
  }

  /**
   * Threads this member has posted in.
   *
   * An `exists` rather than a join, so a member with two hundred posts in one
   * thread produces one row rather than two hundred that then have to be
   * de-duplicated — which is the version that also breaks paging, because the
   * limit applies before the de-duplication.
   */
  async participatedIn(
    userId: number,
    query: DiscoveryQuery,
    scope: DiscoveryScope,
  ): Promise<DiscoveryPage> {
    return this.page(
      [
        sql`exists (
          select 1 from posts p
           where p.thread_id = t.id and p.author_user_id = ${userId}
             and ${visibleIn(sql`p.visibility`, scope.content)}
        )`,
      ],
      query,
      scope,
    )
  }

  /**
   * The one query every view shares.
   *
   * Private, so there is exactly one place where the permission filter, the
   * visibility filter and the keyset predicate are written — the three things
   * that must be identical across four screens and are easiest to get subtly
   * wrong in the fourth.
   */
  private async page(
    conditions: readonly SQL[],
    query: DiscoveryQuery,
    scope: DiscoveryScope,
  ): Promise<DiscoveryPage> {
    /*
     * No visible communities, no results — without a query running. A view that
     * omitted this for an empty list would list the whole board.
     */
    if (scope.communityIds.length === 0) return { rows: [], nextCursor: null }

    const where: SQL[] = [
      sql`t.community_id in (${sql.join(scope.communityIds.map((id) => sql`${id}`), sql`, `)})`,
      visibleIn(sql`t.visibility`, scope.content),
      ...conditions,
    ]

    /*
     * Keyset on `(last_post_at, id)`. Timestamps tie on a busy board — two
     * posts inside the same millisecond is ordinary — and paging on the
     * timestamp alone would skip or repeat exactly the threads a member is
     * most likely to be reading.
     */
    if (query.after !== null) {
      where.push(
        sql`(t.last_post_at < ${query.after.at}
             or (t.last_post_at = ${query.after.at} and t.id < ${query.after.threadId}))`,
      )
    }

    const rows = resultRows(
      await this.db.execute(sql`
        select t.id as thread_id, t.community_id, f.title as community_title,
               f.slug as community_slug,
               t.title, t.slug, t.author_user_id, t.author_username,
               t.reply_count, t.last_post_at, t.last_post_username
          from threads t
          join communities f on f.id = t.community_id
         where ${sql.join(where, sql` and `)}
         order by t.last_post_at desc, t.id desc
         limit ${query.limit}
      `),
    ) as Array<Record<string, unknown>>

    const mapped: DiscoveryRow[] = rows.map((row) => ({
      threadId: Number(row.thread_id),
      communityId: Number(row.community_id),
      communityTitle: String(row.community_title),
      communitySlug: String(row.community_slug),
      title: String(row.title),
      slug: String(row.slug),
      authorUserId: row.author_user_id === null ? null : Number(row.author_user_id),
      authorUsername: String(row.author_username),
      replyCount: Number(row.reply_count),
      lastPostAt:
        row.last_post_at instanceof Date ? row.last_post_at : new Date(String(row.last_post_at)),
      lastPostUsername:
        row.last_post_username === null ? null : String(row.last_post_username),
    }))

    const last = mapped.at(-1)
    return {
      rows: mapped,
      nextCursor:
        mapped.length < query.limit || last === undefined
          ? null
          : { at: last.lastPostAt, threadId: last.threadId },
    }
  }
}
