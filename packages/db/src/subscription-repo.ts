import { sql } from 'drizzle-orm'

import { PUBLIC_CONTENT } from '@meith/core'
import type {
  DigestCadence,
  PendingForUser,
  SubscriptionMode,
  SubscriptionRepository,
  SubscriptionRow,
  SubscriptionTarget,
} from '@meith/subscriptions'
import { parseSubscriptionMode } from '@meith/subscriptions'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { idList } from './sql-lists'
import { toDate } from './row-values'
import { visibleIn } from './visibility'

interface TableShape {
  readonly table: ReturnType<typeof sql>
  readonly column: ReturnType<typeof sql>
}

function shapeFor(target: SubscriptionTarget): TableShape {
  return target === 'thread'
    ? { table: sql`thread_subscriptions`, column: sql`thread_id` }
    : { table: sql`forum_subscriptions`, column: sql`forum_id` }
}

function pendingPosts(
  userId: number,
  mode: SubscriptionMode | null,
  visibleForumIds: readonly number[] | null,
): ReturnType<typeof sql> {
  const byMode = mode === null ? sql`` : sql`and s.mode = ${mode}`
  const visible =
    visibleForumIds === null ? sql`` : sql`and t.forum_id in ${idList(visibleForumIds)}`

  return sql`
    select p.id as post_id, p.thread_id, t.title as thread_title, t.slug as thread_slug,
           t.forum_id, u.username as author_username, p.created_at,
           'thread'::text as target, s.thread_id as target_id
      from thread_subscriptions s
      join threads t on t.id = s.thread_id
      join posts p on p.thread_id = s.thread_id and p.id > s.last_notified_post_id
      left join users u on u.id = p.author_user_id
     where s.user_id = ${userId} ${byMode}
       and p.author_user_id is distinct from ${userId}
       and ${visibleIn(sql`p.visibility`, PUBLIC_CONTENT)}
       and ${visibleIn(sql`t.visibility`, PUBLIC_CONTENT)}
       ${visible}

    union all

    select p.id as post_id, p.thread_id, t.title as thread_title, t.slug as thread_slug,
           t.forum_id, u.username as author_username, p.created_at,
           'forum'::text as target, s.forum_id as target_id
      from forum_subscriptions s
      join threads t on t.forum_id = s.forum_id
      join posts p on p.thread_id = t.id and p.id > s.last_notified_post_id
      left join users u on u.id = p.author_user_id
     where s.user_id = ${userId} ${byMode}
       and p.author_user_id is distinct from ${userId}
       and ${visibleIn(sql`p.visibility`, PUBLIC_CONTENT)}
       and ${visibleIn(sql`t.visibility`, PUBLIC_CONTENT)}
       ${visible}
  `
}

interface RawPending {
  post_id: number
  thread_id: number
  thread_title: string
  thread_slug: string
  forum_id: number
  author_username: string | null
  created_at: string | Date
  target: SubscriptionTarget
  target_id: number
}

export class PostgresSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: Database) {}

  async subscribe(input: {
    readonly userId: number
    readonly target: SubscriptionTarget
    readonly targetId: number
    readonly mode: SubscriptionMode
    readonly at: Date
  }): Promise<boolean> {
    const rows = resultRows(
      input.target === 'thread'
        ? await this.db.execute(sql`
            insert into thread_subscriptions
                   (user_id, thread_id, mode, last_notified_post_id, created_at)
            select ${input.userId}, t.id, ${input.mode},
                   coalesce(t.last_post_id, 0), ${input.at}
              from threads t
             where t.id = ${input.targetId}
                on conflict (user_id, thread_id)
                do update set mode = excluded.mode
            returning user_id
          `)
        : await this.db.execute(sql`
            insert into forum_subscriptions
                   (user_id, forum_id, mode, last_notified_post_id, created_at)
            select ${input.userId}, f.id, ${input.mode},
                   coalesce(f.last_post_id, 0), ${input.at}
              from forums f
             where f.id = ${input.targetId}
                on conflict (user_id, forum_id)
                do update set mode = excluded.mode
            returning user_id
          `),
    ) as Array<{ user_id: number }>

    return rows.length > 0
  }

  async unsubscribe(input: {
    readonly userId: number
    readonly target: SubscriptionTarget
    readonly targetId: number
  }): Promise<boolean> {
    const { table, column } = shapeFor(input.target)
    const rows = resultRows(
      await this.db.execute(sql`
        delete from ${table}
         where user_id = ${input.userId} and ${column} = ${input.targetId}
        returning user_id
      `),
    ) as Array<{ user_id: number }>

    return rows.length > 0
  }

  async modeFor(
    userId: number,
    target: SubscriptionTarget,
    targetId: number,
  ): Promise<SubscriptionMode | null> {
    const { table, column } = shapeFor(target)
    const rows = resultRows(
      await this.db.execute(sql`
        select mode from ${table}
         where user_id = ${userId} and ${column} = ${targetId}
      `),
    ) as Array<{ mode: string }>

    const stored = rows[0]?.mode
    return stored === undefined ? null : parseSubscriptionMode(stored)
  }

  async listFor(
    userId: number,
    options: { readonly visibleForumIds: readonly number[]; readonly limit: number },
  ): Promise<readonly SubscriptionRow[]> {
    const visible = idList(options.visibleForumIds)

    const rows = resultRows(
      await this.db.execute(sql`
        with pending as (
          select target, target_id, count(*)::int as pending
            from (${pendingPosts(userId, null, options.visibleForumIds)}) p
           group by target, target_id
        )
        select 'thread'::text as target, s.thread_id as target_id, t.title,
               t.slug, s.mode, s.created_at,
               coalesce(pending.pending, 0) as pending
          from thread_subscriptions s
          join threads t on t.id = s.thread_id
          left join pending
                 on pending.target = 'thread' and pending.target_id = s.thread_id
         where s.user_id = ${userId}
           and ${visibleIn(sql`t.visibility`, PUBLIC_CONTENT)}
           and t.forum_id in ${visible}

        union all

        select 'forum'::text as target, s.forum_id as target_id, f.title,
               f.slug, s.mode, s.created_at,
               coalesce(pending.pending, 0) as pending
          from forum_subscriptions s
          join forums f on f.id = s.forum_id
          left join pending
                 on pending.target = 'forum' and pending.target_id = s.forum_id
         where s.user_id = ${userId} and s.forum_id in ${visible}

         order by created_at desc, target_id desc
         limit ${options.limit}
      `),
    ) as Array<{
      target: SubscriptionTarget
      target_id: number
      title: string
      slug: string
      mode: string
      created_at: string | Date
      pending: number
    }>

    return rows.map((row) => ({
      target: row.target,
      targetId: Number(row.target_id),
      title: row.title,
      href:
        row.target === 'thread'
          ? `/thread/${Number(row.target_id)}-${row.slug}`
          : `/${Number(row.target_id)}-${row.slug}`,
      mode: parseSubscriptionMode(row.mode) ?? 'instant',
      createdAt: toDate(row.created_at),
      pending: Number(row.pending),
    }))
  }

  async usersWithPending(input: {
    readonly mode: SubscriptionMode
    readonly dueBefore: Date | null
    readonly limit: number
  }): Promise<readonly number[]> {
    const cadence = input.dueBefore === null ? null : input.mode
    const dueClause =
      input.dueBefore === null || cadence === null
        ? sql``
        : sql`
            and not exists (
              select 1 from digest_runs d
               where d.user_id = s.user_id and d.cadence = ${cadence}
                 and d.last_sent_at > ${input.dueBefore}
            )
          `

    const rows = resultRows(
      await this.db.execute(sql`
        select distinct s.user_id
          from (
            select user_id, thread_id as target_id, mode, last_notified_post_id,
                   'thread'::text as target
              from thread_subscriptions
             union all
            select user_id, forum_id as target_id, mode, last_notified_post_id,
                   'forum'::text as target
              from forum_subscriptions
          ) s
         where s.mode = ${input.mode}
           and exists (
             select 1
               from threads t
               join posts p on p.thread_id = t.id and p.id > s.last_notified_post_id
              where (
                      (s.target = 'thread' and t.id = s.target_id)
                   or (s.target = 'forum' and t.forum_id = s.target_id)
                    )
                and p.author_user_id is distinct from s.user_id
                and ${visibleIn(sql`p.visibility`, PUBLIC_CONTENT)}
                and ${visibleIn(sql`t.visibility`, PUBLIC_CONTENT)}
           )
           ${dueClause}
         order by s.user_id
         limit ${input.limit}
      `),
    ) as Array<{ user_id: number }>

    return rows.map((row) => Number(row.user_id))
  }

  async pendingFor(input: {
    readonly userId: number
    readonly mode: SubscriptionMode
    readonly visibleForumIds: readonly number[]
    readonly limit: number
  }): Promise<PendingForUser> {
    const rows = resultRows(
      await this.db.execute(sql`
        select * from (${pendingPosts(input.userId, input.mode, input.visibleForumIds)}) p
         order by p.thread_id, p.post_id
         limit ${input.limit}
      `),
    ) as RawPending[]

    const highest = new Map<string, { target: SubscriptionTarget; targetId: number; lastPostId: number }>()
    for (const row of rows) {
      const key = `${row.target}:${row.target_id}`
      const current = highest.get(key)
      const postId = Number(row.post_id)
      if (current === undefined || postId > current.lastPostId) {
        highest.set(key, {
          target: row.target,
          targetId: Number(row.target_id),
          lastPostId: postId,
        })
      }
    }

    const seen = new Set<number>()
    const posts = []
    for (const row of rows) {
      const postId = Number(row.post_id)
      if (seen.has(postId)) continue
      seen.add(postId)
      posts.push({
        postId,
        threadId: Number(row.thread_id),
        threadTitle: row.thread_title,
        threadSlug: row.thread_slug,
        forumId: Number(row.forum_id),
        authorUsername: row.author_username,
        createdAt: toDate(row.created_at),
      })
    }

    return { userId: input.userId, posts, watermarks: [...highest.values()] }
  }

  async advanceWatermarks(input: {
    readonly userId: number
    readonly watermarks: PendingForUser['watermarks']
  }): Promise<void> {
    if (input.watermarks.length === 0) return

    await this.db.transaction(async (tx) => {
      for (const mark of input.watermarks) {
        const { table, column } = shapeFor(mark.target)
        await tx.execute(sql`
          update ${table}
             set last_notified_post_id = greatest(last_notified_post_id, ${mark.lastPostId})
           where user_id = ${input.userId} and ${column} = ${mark.targetId}
        `)
      }
    })
  }

  async recordDigestRun(input: {
    readonly userId: number
    readonly cadence: DigestCadence
    readonly at: Date
  }): Promise<void> {
    await this.db.execute(sql`
      insert into digest_runs (user_id, cadence, last_sent_at)
      values (${input.userId}, ${input.cadence}, ${input.at})
          on conflict (user_id, cadence)
          do update set last_sent_at = excluded.last_sent_at
    `)
  }
}
