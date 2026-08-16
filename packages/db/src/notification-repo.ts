import { sql } from 'drizzle-orm'

import { notificationKind } from '@meith/notifications'
import type {
  DeliverableNotification,
  NotificationData,
  NotificationPage,
  NotificationRecord,
  NotificationRepository,
  RaiseInput,
  RaiseResult,
} from '@meith/notifications'

import type { Database } from './client'
import { decodeCursor, encodeCursor } from './cursor'
import { resultRows } from './result-rows'
import { toDate, toNullableDate } from './row-values'

interface RawNotification {
  id: number
  user_id: number
  kind: string
  data: unknown
  href: string | null
  occurrences: number
  created_at: string | Date
  updated_at: string | Date
  read_at: string | Date | null
}

function toData(value: unknown): NotificationData {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as NotificationData)
    : {}
}

function toRecord(row: RawNotification): NotificationRecord {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    kind: row.kind,
    data: toData(row.data),
    href: row.href,
    occurrences: Number(row.occurrences),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    readAt: toNullableDate(row.read_at),
  }
}

const SELECT_NOTIFICATION = sql`
  select n.id, n.user_id, n.kind, n.data, n.href, n.occurrences,
         n.created_at, n.updated_at, n.read_at
    from notifications n
`

export class PostgresNotificationRepository implements NotificationRepository {
  constructor(private readonly db: Database) {}

  async raise(input: RaiseInput): Promise<RaiseResult> {
    return this.db.transaction(async (tx) => {
      const payload = JSON.stringify(input.data)

      const rows = resultRows(
        input.dedupeKey === null
          ? await tx.execute(sql`
              insert into notifications
                     (user_id, kind, data, href, dedupe_key, created_at, updated_at)
              values (${input.userId}, ${input.kind}, ${payload}::jsonb, ${input.href},
                      null, ${input.at}, ${input.at})
              returning id, occurrences
            `)
          : await tx.execute(sql`
              insert into notifications
                     (user_id, kind, data, href, dedupe_key, created_at, updated_at)
              values (${input.userId}, ${input.kind}, ${payload}::jsonb, ${input.href},
                      ${input.dedupeKey}, ${input.at}, ${input.at})
                  on conflict (user_id, dedupe_key)
                     where read_at is null and dedupe_key is not null
                  do update
                    set occurrences = notifications.occurrences + 1,
                        /*
                         * The newest facts win: an administrator reading "this
                         * task failed 40 times" wants the *last* error, not the
                         * first one from six hours ago.
                         */
                        data = excluded.data,
                        href = excluded.href,
                        updated_at = excluded.updated_at
              returning id, occurrences
            `),
      ) as Array<{ id: number; occurrences: number }>

      const row = rows[0]
      if (row === undefined) throw new Error('Notification insert returned no row')

      const notificationId = Number(row.id)
      const coalesced = Number(row.occurrences) > 1

      const emailQueued = input.email && !coalesced

      if (emailQueued) {
        await tx.execute(sql`
          insert into outbox (topic, payload)
          values (
            'notification.created',
            ${JSON.stringify({
              notificationId,
              userId: input.userId,
              kind: input.kind,
            })}::jsonb
          )
        `)
      }

      return { notificationId, coalesced, emailQueued }
    })
  }

  async listFor(
    userId: number,
    options: {
      readonly limit: number
      readonly after?: string
      readonly offset?: number
    },
  ): Promise<NotificationPage> {
    const cursor = options.after === undefined ? null : decodeCursor(options.after)
    const after = cursor
      ? sql`and (n.created_at, n.id) < (${cursor.at}, ${cursor.id})`
      : sql``

    const rows = resultRows(
      await this.db.execute(sql`
        ${SELECT_NOTIFICATION}
         where n.user_id = ${userId} ${after}
         order by n.created_at desc, n.id desc
         limit ${options.limit + 1} offset ${options.offset ?? 0}
      `),
    ) as RawNotification[]

    const page = rows.slice(0, options.limit).map(toRecord)
    const last = page.at(-1)
    return rows.length > options.limit && last
      ? { rows: page, nextCursor: encodeCursor(last.createdAt, last.id) }
      : { rows: page }
  }

  async countFor(userId: number): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        select count(*)::int as total from notifications where user_id = ${userId}
      `),
    ) as Array<{ total: number }>

    return Number(rows[0]?.total ?? 0)
  }

  async unreadCount(userId: number): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        select count(*)::int as unread
          from notifications
         where user_id = ${userId} and read_at is null
      `),
    ) as Array<{ unread: number }>
    return Number(rows[0]?.unread ?? 0)
  }

  async markRead(userId: number, notificationId: number): Promise<boolean> {
    const rows = resultRows(
      await this.db.execute(sql`
        update notifications
           set read_at = now()
         where id = ${notificationId} and user_id = ${userId} and read_at is null
        returning id
      `),
    ) as Array<{ id: number }>
    return rows.length > 0
  }

  async markAllRead(userId: number): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        update notifications
           set read_at = now()
         where user_id = ${userId} and read_at is null
        returning id
      `),
    ) as Array<{ id: number }>
    return rows.length
  }

  async emailPreferencesFor(userId: number): Promise<ReadonlyMap<string, boolean>> {
    const rows = resultRows(
      await this.db.execute(sql`
        select kind, email from notification_preferences where user_id = ${userId}
      `),
    ) as Array<{ kind: string; email: boolean }>

    return new Map(rows.map((row) => [row.kind, row.email === true]))
  }

  async saveEmailPreferences(
    userId: number,
    entries: ReadonlyMap<string, boolean>,
  ): Promise<void> {
    if (entries.size === 0) return

    const values = sql.join(
      [...entries].map(
        ([kind, email]) => sql`(${userId}, ${kind}, ${email}, now())`,
      ),
      sql`, `,
    )

    await this.db.execute(sql`
      insert into notification_preferences (user_id, kind, email, updated_at)
      values ${values}
          on conflict (user_id, kind)
          do update set email = excluded.email, updated_at = now()
    `)
  }

  async findForDelivery(notificationId: number): Promise<DeliverableNotification | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select n.id, n.user_id, n.kind, n.data, n.href, n.occurrences,
               n.created_at, n.updated_at, n.read_at, n.email_sent_at,
               u.username, u.email, u.state,
               p.email as preference
          from notifications n
          join users u on u.id = n.user_id
          left join notification_preferences p
                 on p.user_id = n.user_id and p.kind = n.kind
         where n.id = ${notificationId}
      `),
    ) as Array<
      RawNotification & {
        email_sent_at: string | Date | null
        username: string
        email: string
        state: string
        preference: boolean | null
      }
    >

    const row = rows[0]
    if (row === undefined) return null
    if (row.state === 'deleted') return null

    const spec = notificationKind(row.kind)

    return {
      notification: toRecord(row),
      recipient: {
        userId: Number(row.user_id),
        username: row.username,
        email: row.email,
      },
      emailEnabled: row.preference ?? spec?.emailByDefault ?? false,
      emailSentAt: toNullableDate(row.email_sent_at),
    }
  }

  async markEmailSent(notificationId: number, at: Date): Promise<void> {
    await this.db.execute(sql`
      update notifications set email_sent_at = ${at} where id = ${notificationId}
    `)
  }

  async administratorIds(limit: number): Promise<readonly number[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select u.id
          from users u
         where u.state = 'active'
           and exists (
                 select 1
                   from usergroups g
                  where g.can_access_admin_cp
                    and (
                      g.id = u.primary_group_id
                      or g.id in (
                        select m.group_id
                          from user_group_memberships m
                         where m.user_id = u.id
                      )
                    )
               )
         order by u.id
         limit ${limit}
      `),
    ) as Array<{ id: number }>

    return rows.map((row) => Number(row.id))
  }
}
