import { sql } from 'drizzle-orm'

import { BodyFormat } from '@meith/markdown'
import type {
  FolderCounts,
  MessageDetail,
  MessageFolder,
  MessageListRow,
  MessageRepository,
  MessageRole,
  PrivateMessage,
} from '@meith/messages'

import type { Database } from './client'
import { resultRows } from './result-rows'

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

function toNullableDate(value: string | Date | null): Date | null {
  return value === null ? null : toDate(value)
}

const NAMES_SHOWN = 3

interface RawMessage {
  id: number
  author_user_id: number | null
  author_username: string
  subject: string
  message: string
  message_html: string | null
  render_version: number
  body_format: number
  vocab_version: number
  reply_to_id: number | null
  receipt_requested: boolean
  sent_at: string | Date
}

function toMessage(row: RawMessage): PrivateMessage {
  return {
    id: Number(row.id),
    authorUserId: row.author_user_id === null ? null : Number(row.author_user_id),
    authorUsername: row.author_username,
    subject: row.subject,
    message: row.message,
    messageHtml: row.message_html,
    renderVersion: Number(row.render_version),
    bodyFormat: Number(row.body_format),
    vocabVersion: Number(row.vocab_version),
    replyToId: row.reply_to_id === null ? null : Number(row.reply_to_id),
    receiptRequested: row.receipt_requested === true,
    sentAt: toDate(row.sent_at),
  }
}

const MESSAGE_COLUMNS = sql`
  m.id, m.author_user_id, m.author_username, m.subject, m.message,
  m.message_html, m.render_version, m.body_format, m.vocab_version, m.reply_to_id,
  m.receipt_requested, m.sent_at
`

export class PostgresMessageRepository implements MessageRepository {
  constructor(private readonly db: Database) {}

  async list(input: {
    readonly userId: number
    readonly folder: MessageFolder
    readonly limit: number
    readonly before?: number | undefined
  }): Promise<readonly MessageListRow[]> {
    const before =
      input.before === undefined ? sql`` : sql`and c.id < ${input.before}`

    const rows = resultRows(
      await this.db.execute(sql`
        select c.id       as copy_id,
               c.message_id,
               c.folder,
               c.role,
               c.read_at,
               m.subject,
               m.sent_at,
               /*
                * The *other* people on the message. The author is excluded from
                * a sent line (it is you) and the viewer from an inbox line, so
                * both folders read as "who else was involved".
                *
                * A bcc recipient is named only to the author. Everybody else
                * gets the count without the name, which is the whole point of
                * bcc — and doing it in SQL means no listing path can forget.
                */
               coalesce(names.shown, '{}') as counterparties,
               coalesce(names.total, 0)    as counterparty_total
          from private_message_copies c
          join private_messages m on m.id = c.message_id
          left join lateral (
            select array_agg(u.username order by o.id)
                     filter (where o.rn <= ${NAMES_SHOWN}) as shown,
                   count(*)                                as total
              from (
                select oc.owner_user_id as id,
                       row_number() over (order by oc.id) as rn
                  from private_message_copies oc
                 where oc.message_id = c.message_id
                   and oc.owner_user_id <> ${input.userId}
                   and (oc.role <> 'bcc' or m.author_user_id = ${input.userId})
              ) o
              join users u on u.id = o.id
          ) names on true
         where c.owner_user_id = ${input.userId}
           and c.folder = ${input.folder}
           ${before}
         order by c.id desc
         limit ${input.limit}
      `),
    ) as Array<{
      copy_id: number
      message_id: number
      folder: string
      role: string
      read_at: string | Date | null
      subject: string
      sent_at: string | Date
      counterparties: string[] | null
      counterparty_total: number
    }>

    return rows.map((row) => {
      const shown = row.counterparties ?? []
      return {
        copyId: Number(row.copy_id),
        messageId: Number(row.message_id),
        folder: row.folder as MessageFolder,
        role: row.role as MessageRole,
        subject: row.subject,
        sentAt: toDate(row.sent_at),
        readAt: toNullableDate(row.read_at),
        counterparties: shown,
        moreCounterparties: Math.max(0, Number(row.counterparty_total) - shown.length),
      }
    })
  }

  async counts(userId: number): Promise<FolderCounts> {
    const rows = resultRows(
      await this.db.execute(sql`
        select
          count(*) filter (where folder = 'inbox')::int as inbox,
          count(*) filter (where folder = 'sent')::int  as sent,
          count(*) filter (where folder = 'trash')::int as trash,
          count(*) filter (where folder = 'inbox' and read_at is null)::int as unread,
          count(*)::int as stored
        from private_message_copies
       where owner_user_id = ${userId}
      `),
    ) as Array<{ inbox: number; sent: number; trash: number; unread: number; stored: number }>

    const row = rows[0]
    return {
      inbox: Number(row?.inbox ?? 0),
      sent: Number(row?.sent ?? 0),
      trash: Number(row?.trash ?? 0),
      unread: Number(row?.unread ?? 0),
      stored: Number(row?.stored ?? 0),
    }
  }

  async storedCounts(userIds: readonly number[]): Promise<ReadonlyMap<number, number>> {
    if (userIds.length === 0) return new Map()

    const rows = resultRows(
      await this.db.execute(sql`
        select owner_user_id, count(*)::int as n
          from private_message_copies
         where owner_user_id in (${sql.join(
           userIds.map((id) => sql`${id}`),
           sql`, `,
         )})
         group by owner_user_id
      `),
    ) as Array<{ owner_user_id: number; n: number }>

    return new Map(rows.map((row) => [Number(row.owner_user_id), Number(row.n)]))
  }

  async detail(input: {
    readonly messageId: number
    readonly userId: number
  }): Promise<MessageDetail | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select ${MESSAGE_COLUMNS},
               c.id as copy_id, c.folder, c.role, c.read_at
          from private_message_copies c
          join private_messages m on m.id = c.message_id
         where c.message_id = ${input.messageId}
           and c.owner_user_id = ${input.userId}
      `),
    ) as Array<
      RawMessage & {
        copy_id: number
        folder: string
        role: string
        read_at: string | Date | null
      }
    >

    const row = rows[0]
    if (row === undefined) return null

    const people = resultRows(
      await this.db.execute(sql`
        select c.owner_user_id, c.role, c.read_at, u.username
          from private_message_copies c
          join users u on u.id = c.owner_user_id
         where c.message_id = ${input.messageId}
         order by c.id
      `),
    ) as Array<{
      owner_user_id: number
      role: string
      read_at: string | Date | null
      username: string
    }>

    return {
      message: toMessage(row),
      copy: {
        id: Number(row.copy_id),
        messageId: Number(row.id),
        ownerUserId: input.userId,
        folder: row.folder as MessageFolder,
        role: row.role as MessageRole,
        readAt: toNullableDate(row.read_at),
      },
      participants: people.map((person) => ({
        userId: Number(person.owner_user_id),
        username: person.username,
        role: person.role as MessageRole,
        readAt: toNullableDate(person.read_at),
      })),
    }
  }

  async send(input: {
    readonly authorUserId: number
    readonly authorUsername: string
    readonly subject: string
    readonly message: string
    readonly messageHtml: string
    readonly renderVersion: number
    readonly vocabVersion: number
    readonly replyToId: number | null
    readonly receiptRequested: boolean
    readonly recipients: readonly { userId: number; bcc: boolean }[]
    readonly at: Date
  }): Promise<number> {
    return this.db.transaction(async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`
          insert into private_messages
                 (author_user_id, author_username, subject, message, message_html,
                  render_version, body_format, vocab_version, reply_to_id,
                  receipt_requested, sent_at)
          values (${input.authorUserId}, ${input.authorUsername}, ${input.subject},
                  ${input.message}, ${input.messageHtml}, ${input.renderVersion},
                  ${BodyFormat.Markdown}, ${input.vocabVersion}, ${input.replyToId},
                  ${input.receiptRequested}, ${input.at})
          returning id
        `),
      ) as Array<{ id: number }>

      const row = rows[0]
      if (row === undefined) throw new Error('Private message insert returned no row')
      const messageId = Number(row.id)

      const copies = [
        sql`(${messageId}, ${input.authorUserId}, 'sent', 'author', ${input.at}, ${input.at})`,
        ...input.recipients.map(
          (recipient) =>
            sql`(${messageId}, ${recipient.userId}, 'inbox', ${
              recipient.bcc ? 'bcc' : 'to'
            }, null, ${input.at})`,
        ),
      ]

      await tx.execute(sql`
        insert into private_message_copies
               (message_id, owner_user_id, folder, role, read_at, created_at)
        values ${sql.join(copies, sql`, `)}
      `)

      return messageId
    })
  }

  async setRead(input: {
    readonly userId: number
    readonly copyIds: readonly number[]
    readonly at: Date | null
  }): Promise<number> {
    if (input.copyIds.length === 0) return 0

    const rows = resultRows(
      await this.db.execute(sql`
        update private_message_copies
           set read_at = ${input.at}
         where owner_user_id = ${input.userId}
           and id in (${sql.join(
             input.copyIds.map((id) => sql`${id}`),
             sql`, `,
           )})
        returning id
      `),
    ) as Array<{ id: number }>

    return rows.length
  }

  async move(input: {
    readonly userId: number
    readonly copyIds: readonly number[]
    readonly folder: MessageFolder
  }): Promise<number> {
    if (input.copyIds.length === 0) return 0

    const rows = resultRows(
      await this.db.execute(sql`
        update private_message_copies
           set folder = ${input.folder}
         where owner_user_id = ${input.userId}
           and id in (${sql.join(
             input.copyIds.map((id) => sql`${id}`),
             sql`, `,
           )})
        returning id
      `),
    ) as Array<{ id: number }>

    return rows.length
  }

  async remove(input: {
    readonly userId: number
    readonly copyIds: readonly number[]
  }): Promise<number> {
    if (input.copyIds.length === 0) return 0

    const rows = resultRows(
      await this.db.execute(sql`
        delete from private_message_copies
         where owner_user_id = ${input.userId}
           and id in (${sql.join(
             input.copyIds.map((id) => sql`${id}`),
             sql`, `,
           )})
        returning id
      `),
    ) as Array<{ id: number }>

    return rows.length
  }

  async emptyFolder(input: {
    readonly userId: number
    readonly folder: MessageFolder
  }): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        delete from private_message_copies
         where owner_user_id = ${input.userId} and folder = ${input.folder}
        returning id
      `),
    ) as Array<{ id: number }>

    return rows.length
  }

  async forReport(messageId: number): Promise<PrivateMessage | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select ${MESSAGE_COLUMNS} from private_messages m where m.id = ${messageId}
      `),
    ) as RawMessage[]

    return rows[0] === undefined ? null : toMessage(rows[0])
  }
}
