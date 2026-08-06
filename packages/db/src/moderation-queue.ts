import { sql, type SQL } from 'drizzle-orm'

import type {
  ModerationQueueRepository,
  PendingItem,
  QueueDecision,
  QueueItem,
  QueuePage,
  QueueSelection,
} from '@meith/moderation'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { PENDING_APPROVAL } from './visibility'
import { applyVisibilityChangeCounters } from './visibility-counters'

const EXCERPT = 300

function idList(ids: readonly number[]): SQL {
  if (ids.length === 0) return sql`(null)`
  return sql`(${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )})`
}

interface QueueRow {
  kind: 'thread' | 'post'
  id: number
  forum_id: number
  forum_title: string
  thread_id: number
  thread_slug: string
  thread_title: string
  author_user_id: number | null
  author_username: string
  excerpt: string | null
  created_at: Date
}

function encodeCursor(row: QueueItem): string {
  return Buffer.from(
    `${row.createdAt.toISOString()}|${row.kind}|${row.id}`,
    'utf8',
  ).toString('base64url')
}

function decodeCursor(
  value: string,
): { at: Date; kind: string; id: number } | null {
  try {
    const [at, kind, id] = Buffer.from(value, 'base64url').toString('utf8').split('|')
    if (at === undefined || kind === undefined || id === undefined) return null
    const when = new Date(at)
    const numeric = Number(id)
    if (Number.isNaN(when.getTime()) || !Number.isSafeInteger(numeric)) return null
    return { at: when, kind, id: numeric }
  } catch {
    return null
  }
}

function toItem(row: QueueRow): QueueItem {
  return {
    kind: row.kind,
    id: Number(row.id),
    forumId: Number(row.forum_id),
    forumTitle: row.forum_title,
    threadId: Number(row.thread_id),
    threadSlug: row.thread_slug,
    threadTitle: row.thread_title,
    authorUserId: row.author_user_id === null ? null : Number(row.author_user_id),
    authorUsername: row.author_username,
    excerpt: row.excerpt ?? '',
    createdAt: new Date(row.created_at),
  }
}

export class PostgresModerationQueueRepository implements ModerationQueueRepository {
  constructor(private readonly db: Database) {}

  async list(
    forumIds: readonly number[],
    options: { readonly limit: number; readonly after?: string },
  ): Promise<QueuePage> {
    if (forumIds.length === 0) return { items: [] }

    const cursor = options.after === undefined ? null : decodeCursor(options.after)
    const after = cursor
      ? sql`and (q.created_at, q.kind, q.id) > (${cursor.at}, ${cursor.kind}, ${cursor.id})`
      : sql``

    const rows = resultRows(
      await this.db.execute(sql`
        with q as (
          select 'thread'::text as kind, t.id, t.forum_id, f.title as forum_title,
                 t.id as thread_id, t.slug as thread_slug, t.title as thread_title,
                 t.author_user_id, t.author_username,
                 left(p.message, ${EXCERPT}) as excerpt, t.created_at
            from threads t
            join forums f on f.id = t.forum_id
            left join posts p on p.id = t.first_post_id
           where t.forum_id in ${idList(forumIds)}
             and t.visibility = ${PENDING_APPROVAL}
          union all
          select 'post'::text, p.id, p.forum_id, f.title,
                 p.thread_id, t.slug, t.title,
                 p.author_user_id, p.author_username,
                 left(p.message, ${EXCERPT}), p.created_at
            from posts p
            join threads t on t.id = p.thread_id
            join forums f on f.id = p.forum_id
           where p.forum_id in ${idList(forumIds)}
             and p.visibility = ${PENDING_APPROVAL}
             and t.visibility <> ${PENDING_APPROVAL}
             and p.is_first_post = false
        )
        select * from q
         where true ${after}
         order by q.created_at, q.kind, q.id
         limit ${options.limit + 1}
      `),
    ) as QueueRow[]

    const items = rows.slice(0, options.limit).map(toItem)
    const last = items.at(-1)
    return rows.length > options.limit && last
      ? { items, nextCursor: encodeCursor(last) }
      : { items }
  }

  async countPending(forumIds: readonly number[]): Promise<number> {
    if (forumIds.length === 0) return 0
    const rows = resultRows(
      await this.db.execute(sql`
        select
          (select count(*) from threads
            where forum_id in ${idList(forumIds)} and visibility = ${PENDING_APPROVAL})
          +
          (select count(*) from posts p
             join threads t on t.id = p.thread_id
            where p.forum_id in ${idList(forumIds)}
              and p.visibility = ${PENDING_APPROVAL}
              and t.visibility <> ${PENDING_APPROVAL}
              and p.is_first_post = false)
          as pending
      `),
    ) as Array<{ pending: number }>
    return Number(rows[0]?.pending ?? 0)
  }

  async resolve(selection: readonly QueueSelection[]): Promise<readonly PendingItem[]> {
    const threadIds = selection.filter((s) => s.kind === 'thread').map((s) => s.id)
    const postIds = selection.filter((s) => s.kind === 'post').map((s) => s.id)
    if (threadIds.length === 0 && postIds.length === 0) return []

    const rows = resultRows(
      await this.db.execute(sql`
        select 'thread'::text as kind, id, forum_id from threads
         where id in ${idList(threadIds)} and visibility = ${PENDING_APPROVAL}
        union all
        select 'post'::text, id, forum_id from posts
         where id in ${idList(postIds)} and visibility = ${PENDING_APPROVAL}
      `),
    ) as Array<{ kind: 'thread' | 'post'; id: number; forum_id: number }>

    return rows.map((row) => ({
      kind: row.kind,
      id: Number(row.id),
      forumId: Number(row.forum_id),
    }))
  }

  async apply(input: {
    readonly decision: QueueDecision
    readonly threadIds: readonly number[]
    readonly postIds: readonly number[]
    readonly actorUserId: number
    readonly at: Date
  }): Promise<number> {
    if (input.threadIds.length === 0 && input.postIds.length === 0) return 0
    const approving = input.decision === 'approve'
    const to = approving ? 'visible' : 'deleted'

    return this.db.transaction(async (tx) => {
      let applied = 0

      for (const threadId of input.threadIds) {
        const moved = resultRows(
          await tx.execute(sql`
            update threads set visibility = ${to}, updated_at = now()
             where id = ${threadId} and visibility = ${PENDING_APPROVAL}
             returning id, forum_id, first_post_id, author_user_id
          `),
        ) as Array<{
          id: number
          forum_id: number
          first_post_id: number | null
          author_user_id: number | null
        }>
        const thread = moved[0]
        if (!thread) continue
        applied += 1

        if (thread.first_post_id !== null) {
          const post = resultRows(
            await tx.execute(sql`
              update posts set visibility = ${to}
               where id = ${thread.first_post_id} and visibility = ${PENDING_APPROVAL}
               returning id
            `),
          ) as Array<{ id: number }>

          if (post[0] && approving) {
            await applyVisibilityChangeCounters(tx, {
              postId: Number(post[0].id),
              threadId: Number(thread.id),
              forumId: Number(thread.forum_id),
              authorId:
                thread.author_user_id === null ? null : Number(thread.author_user_id),
              isFirstPost: true,
              delta: 1,
            })
          }
        }
      }

      for (const postId of input.postIds) {
        const moved = resultRows(
          await tx.execute(sql`
            update posts set visibility = ${to}
             where id = ${postId} and visibility = ${PENDING_APPROVAL}
             returning id, thread_id, forum_id, author_user_id, is_first_post
          `),
        ) as Array<{
          id: number
          thread_id: number
          forum_id: number
          author_user_id: number | null
          is_first_post: boolean
        }>
        const post = moved[0]
        if (!post) continue
        applied += 1

        if (approving) {
          await applyVisibilityChangeCounters(tx, {
            postId: Number(post.id),
            threadId: Number(post.thread_id),
            forumId: Number(post.forum_id),
            authorId: post.author_user_id === null ? null : Number(post.author_user_id),
            isFirstPost: post.is_first_post,
            delta: 1,
          })
        }
      }

      if (applied > 0) {
        await tx.execute(sql`
          insert into admin_log (user_id, action, detail, created_at)
          values (
            ${input.actorUserId},
            ${`moderation.${input.decision}`},
            ${JSON.stringify({
              threadIds: input.threadIds,
              postIds: input.postIds,
              applied,
            })}::jsonb,
            ${input.at}
          )
        `)
      }

      return applied
    })
  }
}
