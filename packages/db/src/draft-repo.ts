import { sql } from 'drizzle-orm'

import { BodyFormat, sourceAsMarkdown } from '@meith/markdown'
import type { Draft, DraftRepository } from '@meith/drafts'

import type { Database } from './client'
import { resultRows } from './result-rows'

export class PostgresDraftRepository implements DraftRepository {
  constructor(private readonly db: Database) {}

  async find(userId: number, communityId: number, threadId: number | null): Promise<Draft | null> {
    const rows = resultRows(await this.db.execute(sql`
      select community_id, thread_id, title, message, body_format, prefix_id from post_drafts
       where user_id = ${userId} and community_id = ${communityId}
         and thread_id is not distinct from ${threadId}
    `)) as Array<{ community_id: number; thread_id: number | null; title: string; message: string; body_format: number; prefix_id: number | null }>
    const row = rows[0]
    return row === undefined ? null : {
      communityId: Number(row.community_id), threadId: row.thread_id === null ? null : Number(row.thread_id),
      /*
       * A draft saved before this board spoke Markdown is converted here, so it
       * arrives in the composer as the text that will post correctly. Converted
       * on the way out rather than rewritten in place: a draft is a handful of
       * rows with a short life, and it is about to be replaced by whatever the
       * member types next anyway.
       */
      title: row.title, message: sourceAsMarkdown(row.message, Number(row.body_format)),
      prefixId: row.prefix_id === null ? null : Number(row.prefix_id),
    }
  }

  async save(userId: number, draft: Draft): Promise<void> {
    await this.db.execute(sql`
      insert into post_drafts (user_id, community_id, thread_id, title, message, body_format, prefix_id)
      values (${userId}, ${draft.communityId}, ${draft.threadId}, ${draft.title}, ${draft.message}, ${BodyFormat.Markdown}, ${draft.prefixId})
      on conflict (${sql.raw(draft.threadId === null ? 'user_id, community_id' : 'user_id, thread_id')})
      where ${sql.raw(draft.threadId === null ? 'thread_id is null' : 'thread_id is not null')}
      do update set title = excluded.title, message = excluded.message,
                    body_format = excluded.body_format, prefix_id = excluded.prefix_id,
                    updated_at = now()
    `)
  }

  async remove(userId: number, communityId: number, threadId: number | null): Promise<void> {
    await this.db.execute(sql`
      delete from post_drafts where user_id = ${userId} and community_id = ${communityId}
       and thread_id is not distinct from ${threadId}
    `)
  }
}
