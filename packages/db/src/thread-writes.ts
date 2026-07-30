/**
 * F39 — persisting a new thread.
 *
 * One transaction covers the thread, its opening post, every counter it moves
 * and the event that rolls those counters up the tree. That is the entire
 * reason `applyCreatedContentCounters` takes a transaction handle rather than
 * opening its own: a post that exists while the forum still reports zero
 * threads is the failure this shape prevents (D40/D41).
 */
import { sql } from 'drizzle-orm'

import type {
  CreatedThread,
  ForumPostingTarget,
  NewThreadRecord,
  ThreadWriteRepository,
} from '@forum/threads'

import type { Database } from './client'
import { applyCreatedContentCounters } from './content-counters'
import { resultRows } from './result-rows'

export class PostgresThreadWriteRepository implements ThreadWriteRepository {
  constructor(private readonly db: Database) {}

  /** The posting flags plus the slug the redirect needs, in one row. */
  async postingRules(forumId: number): Promise<ForumPostingTarget | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, type, slug, is_open, allow_threads, requires_prefix,
               moderate_new_threads
          from forums where id = ${forumId}
      `),
    ) as Array<{
      id: number
      type: 'category' | 'forum' | 'link'
      slug: string
      is_open: boolean
      allow_threads: boolean
      requires_prefix: boolean
      moderate_new_threads: boolean
    }>

    const row = rows[0]
    if (!row) return null

    return {
      id: Number(row.id),
      type: row.type,
      slug: row.slug,
      isOpen: row.is_open,
      allowThreads: row.allow_threads,
      requiresPrefix: row.requires_prefix,
      moderateNewThreads: row.moderate_new_threads,
    }
  }

  async create(record: NewThreadRecord): Promise<CreatedThread> {
    return this.db.transaction(async (tx) => {
      const threadRows = resultRows(
        await tx.execute(sql`
          insert into threads
            (forum_id, title, slug, prefix_id, author_user_id, author_username,
             visibility, last_post_at, created_at, updated_at)
          values
            (${record.forumId}, ${record.title}, ${record.slug}, ${record.prefixId},
             ${record.authorUserId}, ${record.authorUsername}, ${record.visibility},
             ${record.createdAt}, ${record.createdAt}, ${record.createdAt})
          returning id
        `),
      ) as Array<{ id: number }>
      const threadId = Number(threadRows[0]!.id)

      const postRows = resultRows(
        await tx.execute(sql`
          insert into posts
            (thread_id, forum_id, author_user_id, author_username, message,
             visibility, is_first_post, created_at)
          values
            (${threadId}, ${record.forumId}, ${record.authorUserId},
             ${record.authorUsername}, ${record.message}, ${record.visibility},
             true, ${record.createdAt})
          returning id
        `),
      ) as Array<{ id: number }>
      const postId = Number(postRows[0]!.id)

      if (record.visibility === 'visible') {
        await applyCreatedContentCounters(tx, {
          postId,
          threadId,
          forumId: record.forumId,
          authorId: record.authorUserId,
          authorUsername: record.authorUsername,
          threadTitle: record.title,
          createdAt: record.createdAt,
          isNewThread: true,
        })
      } else {
        /*
         * An unapproved thread moves no counter and emits no event, because
         * every counter on the board means "visible content" (D41). Approval is
         * F48's transition, and it is what applies them — deliberately not a
         * counter written now and corrected later, which would show the board a
         * thread count for content nobody can read.
         */
        await tx.execute(sql`
          update threads set first_post_id = ${postId} where id = ${threadId}
        `)
      }

      if (record.subscribe) {
        /*
         * Inside the same transaction: a subscription that survives a failed
         * post would notify people about a thread that does not exist.
         */
        await tx.execute(sql`
          insert into thread_subscriptions (user_id, thread_id, notify_via)
          values (${record.authorUserId}, ${threadId}, 'notification')
          on conflict (user_id, thread_id) do nothing
        `)
      }

      return { threadId, postId, slug: record.slug, visibility: record.visibility }
    })
  }

  /**
   * When this author last posted anything, for the flood check.
   *
   * Counts unapproved posts too: a queue full of held posts is exactly the
   * pattern the interval exists to slow down, and exempting them would make
   * moderation the cheapest way to flood.
   */
  async lastPostAt(userId: number): Promise<Date | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select created_at from posts
         where author_user_id = ${userId} and visibility <> 'deleted'
         order by created_at desc
         limit 1
      `),
    ) as Array<{ created_at: Date }>

    const at = rows[0]?.created_at
    return at === undefined ? null : new Date(at)
  }

  /**
   * Prefixes offered in this forum.
   *
   * A prefix with no `forum_path_prefix` is board-wide; one with a path is
   * scoped to that subtree, matched with the separator so `1.4` does not offer
   * `1.40`'s prefixes (D22's trap again, and the reason this is a query rather
   * than a filter in JavaScript).
   */
  async allowedPrefixIds(forumId: number): Promise<readonly number[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select p.id
          from thread_prefixes p
          left join forums f on f.id = ${forumId}
         where p.forum_path_prefix is null
            or f.path = p.forum_path_prefix
            or f.path like p.forum_path_prefix || '.%'
         order by p.display_order, p.id
      `),
    ) as Array<{ id: number }>

    return rows.map((row) => Number(row.id))
  }

  /** The prefixes a composer form should offer, with their labels. */
  async listPrefixes(
    forumId: number,
  ): Promise<readonly { id: number; label: string; token: string | null }[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select p.id, p.label, p.token
          from thread_prefixes p
          left join forums f on f.id = ${forumId}
         where p.forum_path_prefix is null
            or f.path = p.forum_path_prefix
            or f.path like p.forum_path_prefix || '.%'
         order by p.display_order, p.id
      `),
    ) as Array<{ id: number; label: string; token: string | null }>

    return rows.map((row) => ({
      id: Number(row.id),
      label: row.label,
      token: row.token,
    }))
  }
}
