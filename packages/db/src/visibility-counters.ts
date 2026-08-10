import type { SQLWrapper } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'

interface CounterTransaction {
  execute(query: SQLWrapper): Promise<unknown>
}

export interface VisibilityChange {
  readonly postId: number
  readonly threadId: number
  readonly forumId: number
  readonly authorId: number | null
  readonly isFirstPost: boolean
  readonly delta: 1 | -1
}

export async function repairThreadLastPost(
  tx: CounterTransaction,
  threadId: number,
): Promise<void> {
  await tx.execute(sql`
    with newest as (
      select id, author_user_id, author_username, created_at
        from posts
       where thread_id = ${threadId} and visibility = 'visible'
       order by id desc
       limit 1
    )
    update threads t
       set last_post_id = (select id from newest),
           last_post_user_id = (select author_user_id from newest),
           last_post_username = (select author_username from newest),
           last_post_at = coalesce((select created_at from newest), t.created_at),
           updated_at = now()
     where t.id = ${threadId}
  `)
}

export async function repairForumLastPostChain(
  tx: CounterTransaction,
  forumId: number,
): Promise<void> {
  const chain = resultRows(
    await tx.execute(sql`
      select f.id
        from forums f
        join forums child on child.id = ${forumId}
       where f.id = child.id or child.path like f.path || '.%'
       order by f.depth desc
    `),
  ) as Array<{ id: number }>

  for (const forum of chain) {
    await tx.execute(sql`
      with own as (
        select t.last_post_id as post_id, t.last_post_at as at, t.id as thread_id,
               t.title as thread_title, t.last_post_user_id as user_id,
               t.last_post_username as username
          from threads t
         where t.forum_id = ${forum.id}
           and t.visibility = 'visible'
           and t.last_post_id is not null
         order by t.last_post_at desc, t.last_post_id desc
         limit 1
      ),
      kid as (
        select c.last_post_id as post_id, c.last_post_at as at,
               c.last_post_thread_id as thread_id, c.last_post_thread_title as thread_title,
               c.last_post_user_id as user_id, c.last_post_username as username
          from forums c
         where c.parent_id = ${forum.id} and c.last_post_id is not null
         order by c.last_post_at desc, c.last_post_id desc
         limit 1
      ),
      best as (
        select * from (select * from own union all select * from kid) candidates
         order by at desc, post_id desc
         limit 1
      )
      update forums f
         set last_post_id = (select post_id from best),
             last_post_thread_id = (select thread_id from best),
             last_post_thread_title = (select thread_title from best),
             last_post_user_id = (select user_id from best),
             last_post_username = (select username from best),
             last_post_at = (select at from best),
             updated_at = now()
       where f.id = ${forum.id}
    `)
  }
}

export async function applyVisibilityChangeCounters(
  tx: CounterTransaction,
  change: VisibilityChange,
): Promise<void> {
  const threadDelta = change.isFirstPost ? change.delta : 0
  const replyDelta = change.isFirstPost ? 0 : change.delta

  await tx.execute(sql`
    update forums
       set post_count = greatest(post_count + ${change.delta}, 0),
           thread_count = greatest(thread_count + ${threadDelta}, 0),
           updated_at = now()
     where id = ${change.forumId}
  `)

  await tx.execute(sql`
    update threads
       set reply_count = greatest(reply_count + ${replyDelta}, 0),
           updated_at = now()
     where id = ${change.threadId}
  `)

  if (change.authorId !== null) {
    await tx.execute(sql`
      update users
         set post_count = greatest(post_count + ${change.delta}, 0),
             thread_count = greatest(thread_count + ${threadDelta}, 0),
             updated_at = now()
       where id = ${change.authorId}
    `)
  }

  await repairThreadLastPost(tx, change.threadId)
  await repairForumLastPostChain(tx, change.forumId)

  await tx.execute(sql`
    insert into outbox (topic, payload)
    values (
      'post.visibility_changed',
      ${JSON.stringify({
        postId: change.postId,
        threadId: change.threadId,
        forumId: change.forumId,
        visible: change.delta === 1,
      })}::jsonb
    )
  `)
}

export async function applyAncestorVisibilityChange(
  db: Database,
  postId: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const found = resultRows(
      await tx.execute(sql`
        select visibility, forum_id, is_first_post from posts where id = ${postId}
      `),
    ) as Array<{ visibility: string; forum_id: number; is_first_post: boolean }>

    const post = found[0]
    if (!post) return false

    const shouldCount = post.visibility === 'visible'
    if (shouldCount) {
      const claimed = await tx.execute(sql`
        insert into content_counter_rollups (post_id) values (${postId})
        on conflict (post_id) do nothing
        returning post_id
      `)
      if (resultRows(claimed).length === 0) return false
    } else {
      const released = await tx.execute(sql`
        delete from content_counter_rollups where post_id = ${postId} returning post_id
      `)
      if (resultRows(released).length === 0) return false
    }

    const delta = shouldCount ? 1 : -1
    const threadDelta = post.is_first_post ? delta : 0

    await tx.execute(sql`
      update forums f
         set post_count = greatest(f.post_count + ${delta}, 0),
             thread_count = greatest(f.thread_count + ${threadDelta}, 0),
             updated_at = now()
        from forums child
       where child.id = ${post.forum_id}
         and f.id <> child.id
         and child.path like f.path || '.%'
    `)

    return true
  })
}
