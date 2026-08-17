import { sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'
import type { MoveDestination, ThreadToolsRepository, ThreadToolTarget } from '@meith/moderation'

import type { Database } from './client'
import { resultRows } from './result-rows'
import {
  applyAuthorCounts,
  applyForumChain,
  logModeratorAction as log,
  syncLedger,
  tallyThread,
} from './thread-counters'
import { repairForumLastPostChain, repairThreadLastPost } from './visibility-counters'

export class PostgresThreadToolsRepository implements ThreadToolsRepository {
  constructor(private readonly db: Database) {}

  async find(threadId: number): Promise<ThreadToolTarget | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, forum_id, slug, title, is_locked, is_sticky, visibility
          from threads where id = ${threadId}
      `),
    ) as Array<{
      id: number
      forum_id: number
      slug: string
      title: string
      is_locked: boolean
      is_sticky: boolean
      visibility: ThreadToolTarget['visibility']
    }>

    const row = rows[0]
    if (!row) return null
    return {
      id: Number(row.id),
      forumId: Number(row.forum_id),
      slug: row.slug,
      title: row.title,
      isLocked: row.is_locked,
      isSticky: row.is_sticky,
      visibility: row.visibility,
    }
  }

  async findDestination(forumId: number): Promise<MoveDestination | null> {
    const rows = resultRows(
      await this.db.execute(sql`select id, type, allow_threads from forums where id = ${forumId}`),
    ) as Array<{ id: number; type: MoveDestination['type']; allow_threads: boolean }>
    const row = rows[0]
    return row === undefined
      ? null
      : { id: Number(row.id), type: row.type, allowThreads: row.allow_threads === true }
  }

  async setLocked(input: {
    readonly threadId: number
    readonly locked: boolean
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean> {
    return this.flag(
      'is_locked',
      input.locked,
      input,
      input.locked ? 'thread.lock' : 'thread.unlock',
    )
  }

  async setSticky(input: {
    readonly threadId: number
    readonly sticky: boolean
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean> {
    return this.flag(
      'is_sticky',
      input.sticky,
      input,
      input.sticky ? 'thread.stick' : 'thread.unstick',
    )
  }

  private async flag(
    column: 'is_locked' | 'is_sticky',
    value: boolean,
    input: { readonly threadId: number; readonly actorUserId: number; readonly at: Date },
    action: string,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const moved = resultRows(
        await tx.execute(
          column === 'is_locked'
            ? sql`update threads set is_locked = ${value}, updated_at = ${input.at}
                   where id = ${input.threadId} and is_locked <> ${value}
                   returning id, forum_id`
            : sql`update threads set is_sticky = ${value}, updated_at = ${input.at}
                   where id = ${input.threadId} and is_sticky <> ${value}
                   returning id, forum_id`,
        ),
      ) as Array<{ id: number; forum_id: number }>
      const row = moved[0]
      if (!row) return false

      const forumId = Number(row.forum_id)
      await log(
        tx,
        action,
        input.actorUserId,
        { threadId: input.threadId, forumId, forumIds: [forumId] },
        input.at,
      )
      return true
    })
  }

  async setVisibility(input: {
    readonly threadId: number
    readonly from: 'visible' | 'deleted'
    readonly to: 'visible' | 'deleted'
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const tally = await tallyThread(tx, input.threadId)

      const moved = resultRows(
        await tx.execute(sql`
          update threads set visibility = ${input.to}, updated_at = ${input.at}
           where id = ${input.threadId} and visibility = ${input.from}
           returning forum_id
        `),
      ) as Array<{ forum_id: number }>
      const row = moved[0]
      if (!row) return false

      const forumId = Number(row.forum_id)
      const delta: 1 | -1 = input.to === 'visible' ? 1 : -1

      await applyForumChain(tx, forumId, delta, tally)
      await applyAuthorCounts(tx, delta, tally)
      await syncLedger(tx, input.threadId, input.to === 'visible')
      await repairForumLastPostChain(tx, forumId)

      await log(
        tx,
        input.to === 'visible' ? 'thread.restore' : 'thread.delete',
        input.actorUserId,
        { threadId: input.threadId, forumId, forumIds: [forumId], posts: tally.posts },
        input.at,
      )
      return true
    })
  }

  async move(input: {
    readonly threadId: number
    readonly fromForumId: number
    readonly toForumId: number
    readonly actorUserId: number
    readonly at: Date
  }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const tally = await tallyThread(tx, input.threadId)

      const moved = resultRows(
        await tx.execute(sql`
          update threads set forum_id = ${input.toForumId}, updated_at = ${input.at}
           where id = ${input.threadId} and forum_id = ${input.fromForumId}
           returning id
        `),
      ) as Array<{ id: number }>
      if (moved.length === 0) return false

      await tx.execute(sql`
        update posts set forum_id = ${input.toForumId} where thread_id = ${input.threadId}
      `)

      await applyForumChain(tx, input.fromForumId, -1, tally)
      await applyForumChain(tx, input.toForumId, 1, tally)

      await repairForumLastPostChain(tx, input.fromForumId)
      await repairForumLastPostChain(tx, input.toForumId)

      await log(
        tx,
        'thread.move',
        input.actorUserId,
        {
          threadId: input.threadId,
          fromForumId: input.fromForumId,
          toForumId: input.toForumId,
          forumIds: [input.fromForumId, input.toForumId],
          posts: tally.posts,
        },
        input.at,
      )
      return true
    })
  }

  async copy(input: {
    readonly threadId: number
    readonly toForumId: number
    readonly actorUserId: number
    readonly at: Date
  }): Promise<{ threadId: number; slug: string; posts: number }> {
    return this.db.transaction(async (tx) => {
      const sourceRows = resultRows(
        await tx.execute(sql`
          select id, forum_id, title, slug, prefix_id, author_user_id, author_username
            from threads where id = ${input.threadId}
        `),
      ) as Array<{
        id: number
        forum_id: number
        title: string
        slug: string
        prefix_id: number | null
        author_user_id: number | null
        author_username: string
      }>
      const source = sourceRows[0]
      if (!source) {
        throw new ValidationError(msg('error.db.thread-exist'))
      }

      const created = resultRows(
        await tx.execute(sql`
          insert into threads
            (forum_id, title, slug, prefix_id, author_user_id, author_username,
             visibility, created_at, updated_at)
          values
            (${input.toForumId}, ${source.title}, ${source.slug}, ${source.prefix_id},
             ${source.author_user_id}, ${source.author_username},
             'visible', ${input.at}, ${input.at})
          returning id, slug
        `),
      ) as Array<{ id: number; slug: string }>
      const newThreadId = Number(created[0]!.id)

      const copied = resultRows(
        await tx.execute(sql`
          insert into posts
            (thread_id, forum_id, author_user_id, author_username, subject, message,
             message_html, render_version, vocab_version, body_format, visibility,
             is_first_post, created_at, search_vector, search_version)
          select ${newThreadId}, ${input.toForumId}, p.author_user_id, p.author_username,
                 p.subject, p.message, p.message_html, p.render_version,
                 /*
                  * Both stamps travel with the body. A copy that claimed to be
                  * Markdown because the column defaults that way would be a post
                  * whose BBCode the backfill has been told it already converted.
                  */
                 p.vocab_version, p.body_format,
                 'visible', p.is_first_post, p.created_at,
                 /*
                  * The search document travels too, for the third time in this list
                  * and the same reason: a copy left with no vector would be a
                  * thread nobody could find until the backfill happened to
                  * reach it. Copying rather than recomputing is exact here —
                  * the copy keeps the source's title, body and opening post, so
                  * every input to the document is the same.
                  */
                 p.search_vector, p.search_version
            from posts p
           where p.thread_id = ${input.threadId} and p.visibility = 'visible'
           order by p.id
          returning id, author_user_id, is_first_post
        `),
      ) as Array<{ id: number; author_user_id: number | null; is_first_post: boolean }>

      const first = copied.find((row) => row.is_first_post) ?? copied[0]
      await tx.execute(sql`
        update threads
           set first_post_id = ${first === undefined ? null : Number(first.id)},
               reply_count = ${Math.max(copied.length - 1, 0)}
         where id = ${newThreadId}
      `)

      const tally = await tallyThread(tx, newThreadId)
      await applyForumChain(tx, input.toForumId, 1, tally)
      await applyAuthorCounts(tx, 1, tally)
      await syncLedger(tx, newThreadId, true)
      await repairThreadLastPost(tx, newThreadId)
      await repairForumLastPostChain(tx, input.toForumId)

      const fromForumId = Number(source.forum_id)
      await log(
        tx,
        'thread.copy',
        input.actorUserId,
        {
          threadId: input.threadId,
          fromForumId,
          toForumId: input.toForumId,
          forumIds: [...new Set([fromForumId, input.toForumId])],
          newThreadId,
          posts: copied.length,
        },
        input.at,
      )

      return { threadId: newThreadId, slug: created[0]!.slug, posts: copied.length }
    })
  }
}
