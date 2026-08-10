import type { SQLWrapper } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { applyAncestorVisibilityChange } from './visibility-counters'

export interface CreatedContent {
  readonly postId: number
  readonly threadId: number
  readonly forumId: number
  readonly authorId: number | null
  readonly authorUsername: string
  readonly threadTitle: string
  readonly createdAt: Date
  readonly isNewThread: boolean
}

interface CounterTransaction {
  execute(query: SQLWrapper): Promise<unknown>
}

export async function applyCreatedContentCounters(
  tx: CounterTransaction,
  content: CreatedContent,
): Promise<void> {
  const newer = sql`last_post_at is null or last_post_id is null
    or last_post_at < ${content.createdAt}
    or (last_post_at = ${content.createdAt} and last_post_id < ${content.postId})`
  const threadNewer = content.isNewThread ? sql`true` : newer

  await tx.execute(sql`
    update forums
       set post_count = post_count + 1,
           thread_count = thread_count + ${content.isNewThread ? 1 : 0},
           last_post_id = case when ${newer} then ${content.postId} else last_post_id end,
           last_post_thread_id = case when ${newer} then ${content.threadId} else last_post_thread_id end,
           last_post_thread_title = case when ${newer} then ${content.threadTitle} else last_post_thread_title end,
           last_post_user_id = case when ${newer} then ${content.authorId} else last_post_user_id end,
           last_post_username = case when ${newer} then ${content.authorUsername} else last_post_username end,
           last_post_at = case when ${newer} then ${content.createdAt} else last_post_at end,
           updated_at = now()
     where id = ${content.forumId}
  `)

  await tx.execute(sql`
    update threads
       set first_post_id = case when ${content.isNewThread} then ${content.postId} else first_post_id end,
           reply_count = reply_count + ${content.isNewThread ? 0 : 1},
           last_post_id = case when ${threadNewer} then ${content.postId} else last_post_id end,
           last_post_user_id = case when ${threadNewer} then ${content.authorId} else last_post_user_id end,
           last_post_username = case when ${threadNewer} then ${content.authorUsername} else last_post_username end,
           last_post_at = case when ${threadNewer} then ${content.createdAt} else last_post_at end,
           updated_at = now()
     where id = ${content.threadId}
  `)

  if (content.authorId !== null) {
    await tx.execute(sql`
      update users
         set post_count = post_count + 1,
             thread_count = thread_count + ${content.isNewThread ? 1 : 0},
             updated_at = now()
       where id = ${content.authorId}
    `)
  }

  await tx.execute(sql`
    insert into outbox (topic, payload)
    values (
      'post.created',
      ${JSON.stringify({
        postId: content.postId,
        threadId: content.threadId,
        forumId: content.forumId,
        authorId: content.authorId,
      })}::jsonb
    )
  `)
}

export async function rollUpAncestorCounters(
  db: Database,
  postId: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const claimed = await tx.execute(sql`
      insert into content_counter_rollups (post_id)
      select p.id from posts p
       where p.id = ${postId} and p.visibility = 'visible'
      on conflict (post_id) do nothing
      returning post_id
    `)
    if (resultRows(claimed).length === 0) return false

    const found = await tx.execute(sql`
      select p.thread_id, p.forum_id, p.author_user_id, p.author_username,
             p.created_at, p.is_first_post, t.title as thread_title
        from posts p
        join threads t on t.id = p.thread_id
       where p.id = ${postId}
    `)
    const post = resultRows(found)[0] as
      | {
          thread_id: number
          forum_id: number
          author_user_id: number | null
          author_username: string
          created_at: Date
          is_first_post: boolean
          thread_title: string
        }
      | undefined
    if (!post) return false

    const ancestorNewer = sql`f.last_post_at is null or f.last_post_id is null
      or f.last_post_at < ${post.created_at}
      or (f.last_post_at = ${post.created_at} and f.last_post_id < ${postId})`

    await tx.execute(sql`
      update forums f
         set post_count = f.post_count + 1,
             thread_count = f.thread_count + ${post.is_first_post ? 1 : 0},
             last_post_id = case when ${ancestorNewer} then ${postId} else f.last_post_id end,
             last_post_thread_id = case when ${ancestorNewer} then ${post.thread_id} else f.last_post_thread_id end,
             last_post_thread_title = case when ${ancestorNewer} then ${post.thread_title} else f.last_post_thread_title end,
             last_post_user_id = case when ${ancestorNewer} then ${post.author_user_id} else f.last_post_user_id end,
             last_post_username = case when ${ancestorNewer} then ${post.author_username} else f.last_post_username end,
             last_post_at = case when ${ancestorNewer} then ${post.created_at} else f.last_post_at end,
             updated_at = now()
        from forums child
       where child.id = ${post.forum_id}
         and f.id <> child.id
         and child.path like f.path || '.%'
    `)

    return true
  })
}

export class PostgresContentCounterRepository {
  constructor(private readonly db: Database) {}

  async recordCreated(content: CreatedContent): Promise<void> {
    await this.db.transaction((tx) => applyCreatedContentCounters(tx, content))
  }

  async rollUpAncestors(postId: number): Promise<boolean> {
    return rollUpAncestorCounters(this.db, postId)
  }

  async applyVisibilityChange(postId: number): Promise<boolean> {
    return applyAncestorVisibilityChange(this.db, postId)
  }
}
