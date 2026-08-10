import { sql } from 'drizzle-orm'

import type {
  MergePlan,
  SplitPlan,
  SurgeryOutcome,
  SurgeryThread,
  ThreadSurgeryRepository,
} from '@meith/moderation'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { repairForumLastPostChain, repairThreadLastPost } from './visibility-counters'

interface Tx {
  execute(query: ReturnType<typeof sql>): Promise<unknown>
}

function idList(ids: readonly number[]): ReturnType<typeof sql> {
  if (ids.length === 0) return sql`(null)`
  return sql`(${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )})`
}

async function applyForumChain(
  tx: Tx,
  forumId: number,
  posts: number,
  threads: number,
): Promise<void> {
  if (posts === 0 && threads === 0) return
  await tx.execute(sql`
    update forums f
       set post_count = greatest(f.post_count + ${posts}, 0),
           thread_count = greatest(f.thread_count + ${threads}, 0),
           updated_at = now()
      from forums child
     where child.id = ${forumId}
       and (f.id = child.id or child.path like f.path || '.%')
  `)
}

async function log(
  tx: Tx,
  action: string,
  actorUserId: number,
  detail: Record<string, unknown>,
  at: Date,
): Promise<void> {
  await tx.execute(sql`
    insert into admin_log (user_id, action, detail, created_at)
    values (${actorUserId}, ${action}, ${JSON.stringify(detail)}::jsonb, ${at})
  `)
}

export class PostgresThreadSurgeryRepository implements ThreadSurgeryRepository {
  constructor(private readonly db: Database) {}

  async find(threadId: number): Promise<SurgeryThread | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select t.id, t.forum_id, t.slug, t.title, t.visibility, t.first_post_id,
               (select count(*)::int from posts p
                 where p.thread_id = t.id and p.visibility = 'visible') as visible_posts
          from threads t where t.id = ${threadId}
      `),
    ) as Array<{
      id: number
      forum_id: number
      slug: string
      title: string
      visibility: SurgeryThread['visibility']
      first_post_id: number | null
      visible_posts: number
    }>

    const row = rows[0]
    if (!row) return null
    return {
      id: Number(row.id),
      forumId: Number(row.forum_id),
      slug: row.slug,
      title: row.title,
      visibility: row.visibility,
      firstPostId: row.first_post_id === null ? null : Number(row.first_post_id),
      visiblePosts: Number(row.visible_posts),
    }
  }

  async postsFrom(threadId: number, fromPostId: number): Promise<readonly number[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id from posts
         where thread_id = ${threadId} and visibility = 'visible' and id >= ${fromPostId}
         order by id
      `),
    ) as Array<{ id: number }>
    return rows.some((row) => Number(row.id) === fromPostId)
      ? rows.map((row) => Number(row.id))
      : []
  }

  async visiblePostIdsIn(
    threadId: number,
    postIds: readonly number[],
  ): Promise<readonly number[]> {
    if (postIds.length === 0) return []
    const list = sql.join(
      postIds.map((id) => sql`${id}`),
      sql`, `,
    )
    const rows = resultRows(
      await this.db.execute(sql`
        select id from posts
         where thread_id = ${threadId} and visibility = 'visible' and id in (${list})
         order by id
      `),
    ) as Array<{ id: number }>
    return rows.map((row) => Number(row.id))
  }

  async split(
    plan: SplitPlan & { actorUserId: number; at: Date },
  ): Promise<SurgeryOutcome> {
    return this.db.transaction(async (tx) => {
      const source = resultRows(
        await tx.execute(sql`
          select forum_id, slug from threads where id = ${plan.sourceThreadId}
        `),
      ) as Array<{ forum_id: number; slug: string }>
      const forumId = Number(source[0]!.forum_id)

      const opener = plan.postIds[0]!
      const author = resultRows(
        await tx.execute(sql`
          select author_user_id, author_username, created_at
            from posts where id = ${opener}
        `),
      ) as Array<{
        author_user_id: number | null
        author_username: string
        created_at: Date
      }>
      const opening = author[0]!

      const created = resultRows(
        await tx.execute(sql`
          insert into threads
            (forum_id, title, slug, author_user_id, author_username, visibility,
             first_post_id, last_post_at, created_at, updated_at)
          values (${forumId}, ${plan.title}, ${slugFor(plan.title)},
                  ${opening.author_user_id}, ${opening.author_username}, 'visible',
                  ${opener}, ${opening.created_at}, ${opening.created_at}, ${plan.at})
          returning id, slug
        `),
      ) as Array<{ id: number; slug: string }>
      const newThreadId = Number(created[0]!.id)

      await tx.execute(sql`
        update posts set thread_id = ${newThreadId}, is_first_post = (id = ${opener})
         where id in ${idList(plan.postIds)}
      `)

      const moved = plan.postIds.length
      await applyForumChain(tx, forumId, 0, 1)
      await tx.execute(sql`
        update threads
           set reply_count = greatest(reply_count - ${moved}, 0), updated_at = ${plan.at}
         where id = ${plan.sourceThreadId}
      `)
      await tx.execute(sql`
        update threads set reply_count = ${moved - 1}, updated_at = ${plan.at}
         where id = ${newThreadId}
      `)

      if (opening.author_user_id !== null) {
        await tx.execute(sql`
          update users set thread_count = thread_count + 1, updated_at = ${plan.at}
           where id = ${opening.author_user_id}
        `)
      }

      await repairThreadLastPost(tx, plan.sourceThreadId)
      await repairThreadLastPost(tx, newThreadId)
      await repairForumLastPostChain(tx, forumId)

      await log(
        tx,
        'thread.split',
        plan.actorUserId,
        { from: plan.sourceThreadId, to: newThreadId, posts: moved },
        plan.at,
      )

      return { threadId: newThreadId, slug: created[0]!.slug, posts: moved }
    })
  }

  async merge(
    plan: MergePlan & { actorUserId: number; at: Date },
  ): Promise<SurgeryOutcome> {
    return this.db.transaction(async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`
          select id, forum_id, slug, author_user_id,
                 (select count(*)::int from posts p
                   where p.thread_id = t.id and p.visibility = 'visible') as visible_posts
            from threads t where t.id in (${plan.sourceThreadId}, ${plan.targetThreadId})
        `),
      ) as Array<{
        id: number
        forum_id: number
        slug: string
        author_user_id: number | null
        visible_posts: number
      }>

      const source = rows.find((r) => Number(r.id) === plan.sourceThreadId)!
      const target = rows.find((r) => Number(r.id) === plan.targetThreadId)!
      const sourceForum = Number(source.forum_id)
      const targetForum = Number(target.forum_id)
      const moved = Number(source.visible_posts)

      await tx.execute(sql`
        update posts
           set thread_id = ${plan.targetThreadId},
               forum_id = ${targetForum},
               is_first_post = false
         where thread_id = ${plan.sourceThreadId}
      `)

      await tx.execute(sql`
        update threads
           set reply_count = reply_count + ${moved}, updated_at = ${plan.at}
         where id = ${plan.targetThreadId}
      `)

      await tx.execute(sql`delete from threads where id = ${plan.sourceThreadId}`)

      if (sourceForum === targetForum) {
        await applyForumChain(tx, sourceForum, 0, -1)
      } else {
        await applyForumChain(tx, sourceForum, -moved, -1)
        await applyForumChain(tx, targetForum, moved, 0)
      }

      if (source.author_user_id !== null) {
        await tx.execute(sql`
          update users
             set thread_count = greatest(thread_count - 1, 0), updated_at = ${plan.at}
           where id = ${source.author_user_id}
        `)
      }

      await repairThreadLastPost(tx, plan.targetThreadId)
      await repairForumLastPostChain(tx, sourceForum)
      if (sourceForum !== targetForum) {
        await repairForumLastPostChain(tx, targetForum)
      }

      await log(
        tx,
        'thread.merge',
        plan.actorUserId,
        {
          from: plan.sourceThreadId,
          to: plan.targetThreadId,
          posts: moved,
          fromForum: sourceForum,
          toForum: targetForum,
        },
        plan.at,
      )

      return { threadId: plan.targetThreadId, slug: target.slug, posts: moved }
    })
  }
}

function slugFor(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug.length === 0 ? 'thread' : slug
}
