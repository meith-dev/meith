import { sql } from 'drizzle-orm'

import { PUBLIC_CONTENT, type ThreadAudience, ValidationError } from '@meith/core'
import type { Draft, DraftRepository, DraftSummary } from '@meith/drafts'
import { msg } from '@meith/i18n'
import { BodyFormat, sourceAsMarkdown } from '@meith/markdown'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { inAudience } from './thread-audience'
import { visibleIn } from './visibility'

export class PostgresDraftRepository implements DraftRepository {
  constructor(private readonly db: Database) {}

  async find(userId: number, forumId: number, threadId: number | null): Promise<Draft | null> {
    const rows = resultRows(
      await this.db.execute(sql`
      select coalesce(t.forum_id, d.forum_id) as forum_id, d.thread_id,
             d.title, d.message, d.body_format, d.prefix_id, d.updated_at
        from post_drafts d left join threads t on t.id = d.thread_id
       where d.user_id = ${userId}
         and ${threadId === null ? sql`d.forum_id = ${forumId} and d.thread_id is null` : sql`d.thread_id = ${threadId}`}
    `),
    ) as Array<{
      forum_id: number
      thread_id: number | null
      title: string
      message: string
      body_format: number
      prefix_id: number | null
      updated_at: Date | string
    }>
    const row = rows[0]
    return row === undefined
      ? null
      : {
          forumId: Number(row.forum_id),
          threadId: row.thread_id === null ? null : Number(row.thread_id),
          title: row.title,
          message: sourceAsMarkdown(row.message, Number(row.body_format)),
          prefixId: row.prefix_id === null ? null : Number(row.prefix_id),
          updatedAt: new Date(row.updated_at),
        }
  }

  async save(userId: number, draft: Draft): Promise<void> {
    await this.db.transaction(async (tx) => {
      let forumId = draft.forumId
      if (draft.threadId !== null) {
        const rows = resultRows<{ forum_id: number }>(
          await tx.execute(
            sql`select forum_id from threads where id = ${draft.threadId} for update`,
          ),
        )
        if (rows[0] === undefined) throw new ValidationError(msg('error.db.thread-exist'))
        forumId = Number(rows[0].forum_id)
      }
      await tx.execute(sql`
        insert into post_drafts (user_id, forum_id, thread_id, title, message, body_format, prefix_id)
        values (${userId}, ${forumId}, ${draft.threadId}, ${draft.title}, ${draft.message}, ${BodyFormat.Markdown}, ${draft.prefixId})
        on conflict (${sql.raw(draft.threadId === null ? 'user_id, forum_id' : 'user_id, thread_id')})
        where ${sql.raw(draft.threadId === null ? 'thread_id is null' : 'thread_id is not null')}
        do update set forum_id = excluded.forum_id, title = excluded.title, message = excluded.message,
                      body_format = excluded.body_format, prefix_id = excluded.prefix_id,
                      updated_at = now()
      `)
    })
  }

  async remove(userId: number, forumId: number, threadId: number | null): Promise<void> {
    await this.db.execute(sql`
      delete from post_drafts where user_id = ${userId}
       and ${threadId === null ? sql`forum_id = ${forumId} and thread_id is null` : sql`thread_id = ${threadId}`}
    `)
  }

  async listByUser(userId: number, audience: ThreadAudience): Promise<readonly DraftSummary[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select coalesce(t.forum_id, d.forum_id) as forum_id, f.title as forum_title, f.slug as forum_slug,
               d.thread_id, t.title as thread_title, t.slug as thread_slug,
               d.title, d.message, d.body_format, d.updated_at
          from post_drafts d
          left join threads t on t.id = d.thread_id
          join forums f on f.id = coalesce(t.forum_id, d.forum_id)
         where d.user_id = ${userId}
           and (
             (d.thread_id is null and ${inAudience(sql`d.forum_id`, sql`d.user_id`, audience)})
             or (${visibleIn(sql`t.visibility`, PUBLIC_CONTENT)} and ${inAudience(sql`t.forum_id`, sql`t.author_user_id`, audience)})
           )
         order by d.updated_at desc
      `),
    ) as Array<{
      forum_id: number
      forum_title: string
      forum_slug: string
      thread_id: number | null
      thread_title: string | null
      thread_slug: string | null
      title: string
      message: string
      body_format: number
      updated_at: Date | string
    }>

    return rows.map((row) => ({
      forumId: Number(row.forum_id),
      forumTitle: row.forum_title,
      forumSlug: row.forum_slug,
      threadId: row.thread_id === null ? null : Number(row.thread_id),
      threadTitle: row.thread_title,
      threadSlug: row.thread_slug,
      title: row.title,
      message: sourceAsMarkdown(row.message, Number(row.body_format)),
      updatedAt: new Date(row.updated_at),
    }))
  }
}
