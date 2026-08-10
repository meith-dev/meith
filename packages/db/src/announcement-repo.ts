import { sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'
import { BodyFormat, sourceAsMarkdown } from '@meith/markdown'

import type { Database } from './client'
import { resultRows } from './result-rows'

export interface AnnouncementRow {
  readonly id: number
  readonly forumId: number | null
  readonly forumTitle: string | null
  readonly forumSlug: string | null
  readonly title: string
  readonly message: string
  readonly authorUserId: number | null
  readonly authorUsername: string
  readonly startsAt: Date
  readonly endsAt: Date | null
  readonly enabled: boolean
  readonly createdAt: Date
}

export interface AnnouncementInput {
  readonly forumId: number | null
  readonly title: string
  readonly message: string
  readonly startsAt: Date
  readonly endsAt: Date | null
  readonly enabled: boolean
}

function toRow(row: Record<string, unknown>): AnnouncementRow {
  return {
    id: Number(row.id),
    forumId: row.forum_id === null ? null : Number(row.forum_id),
    forumTitle: row.forum_title === null || row.forum_title === undefined
      ? null
      : String(row.forum_title),
    forumSlug: row.forum_slug === null || row.forum_slug === undefined
      ? null
      : String(row.forum_slug),
    title: String(row.title),
    message: sourceAsMarkdown(String(row.message), Number(row.body_format ?? BodyFormat.Markdown)),
    authorUserId: row.author_user_id === null ? null : Number(row.author_user_id),
    authorUsername: String(row.author_username),
    startsAt: new Date(String(row.starts_at)),
    endsAt: row.ends_at === null ? null : new Date(String(row.ends_at)),
    enabled: row.enabled === true,
    createdAt: new Date(String(row.created_at)),
  }
}

export class PostgresAnnouncementRepository {
  constructor(private readonly db: Database) {}

  async live(input: {
    readonly now: Date
    readonly visibleForumIds: readonly number[]
    readonly scope?: number | null
  }): Promise<readonly AnnouncementRow[]> {
    const scope = input.scope ?? null

    const visible = sql`${sql.raw('ARRAY[')}${
      input.visibleForumIds.length === 0
        ? sql.raw('')
        : sql.join(input.visibleForumIds.map((id) => sql`${id}`), sql`, `)
    }${sql.raw(']::int[]')}`

    const rows = resultRows(
      await this.db.execute(sql`
        select a.id, a.forum_id, a.title, a.message, a.body_format, a.author_user_id,
               a.author_username, a.starts_at, a.ends_at, a.enabled, a.created_at,
               f.title as forum_title, f.slug as forum_slug
          from announcements a
          left join forums f on f.id = a.forum_id
         where a.enabled
           and a.starts_at <= ${input.now}
           and (a.ends_at is null or a.ends_at > ${input.now})
           and (
                 a.forum_id is null
                 or (a.forum_id = ${scope} and a.forum_id = any(${visible}))
               )
         order by a.starts_at desc, a.id desc
      `),
    ) as Array<Record<string, unknown>>

    return rows.map(toRow)
  }

  async list(): Promise<readonly AnnouncementRow[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select a.id, a.forum_id, a.title, a.message, a.body_format, a.author_user_id,
               a.author_username, a.starts_at, a.ends_at, a.enabled, a.created_at,
               f.title as forum_title, f.slug as forum_slug
          from announcements a
          left join forums f on f.id = a.forum_id
         order by a.starts_at desc, a.id desc
      `),
    ) as Array<Record<string, unknown>>

    return rows.map(toRow)
  }

  async find(id: number): Promise<AnnouncementRow | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select a.id, a.forum_id, a.title, a.message, a.body_format, a.author_user_id,
               a.author_username, a.starts_at, a.ends_at, a.enabled, a.created_at,
               f.title as forum_title, f.slug as forum_slug
          from announcements a
          left join forums f on f.id = a.forum_id
         where a.id = ${id}
      `),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    return row === undefined ? null : toRow(row)
  }

  async create(
    input: AnnouncementInput & { readonly authorUserId: number | null },
  ): Promise<number> {
    assertValid(input)

    const rows = resultRows(
      await this.db.execute(sql`
        insert into announcements (forum_id, title, message, body_format,
                                   author_user_id, author_username, starts_at,
                                   ends_at, enabled)
        values (${input.forumId}, ${input.title}, ${input.message},
                ${BodyFormat.Markdown}, ${input.authorUserId},
                coalesce((select username from users where id = ${input.authorUserId}), ''),
                ${input.startsAt}, ${input.endsAt}, ${input.enabled})
        returning id
      `),
    ) as Array<{ id: number }>

    return Number(rows[0]?.id)
  }

  async update(id: number, input: AnnouncementInput): Promise<void> {
    assertValid(input)

    const rows = resultRows(
      await this.db.execute(sql`
        update announcements
           set forum_id = ${input.forumId}, title = ${input.title},
               message = ${input.message}, body_format = ${BodyFormat.Markdown},
               starts_at = ${input.startsAt},
               ends_at = ${input.endsAt}, enabled = ${input.enabled}
         where id = ${id}
        returning id
      `),
    ) as Array<{ id: number }>

    if (rows[0] === undefined) throw new ValidationError('No such announcement.')
  }

  async delete(id: number): Promise<void> {
    await this.db.execute(sql`delete from announcements where id = ${id}`)
  }
}

function assertValid(input: AnnouncementInput): void {
  if (input.title.trim() === '') throw new ValidationError('An announcement needs a title.')
  if (input.message.trim() === '') {
    throw new ValidationError('An announcement needs something in it.')
  }
  if (input.endsAt !== null && input.endsAt <= input.startsAt) {
    throw new ValidationError('An announcement cannot finish before it starts.')
  }
}
