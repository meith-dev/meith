/**
 * F55 — notifications over Postgres.
 *
 * Three statements carry the feature's decisions; the rest is reading.
 *
 * **`raise` is an upsert against a partial unique index.** The index covers
 * `(user_id, dedupe_key)` only while the row is unread, so a repeated event
 * merges into the outstanding notification and, once that has been read, starts
 * a fresh one. Doing it as read-then-insert would lose the race between two
 * events arriving together — the same reasoning F49 applied to duplicate
 * reports (D48), and the reason this is an index rather than a check.
 *
 * **The outbox row is written in the same transaction as the notification.**
 * That is the one atomicity that matters here: it makes "the board e-mailed me
 * about something my notification centre does not show" unreachable. It is
 * deliberately *not* atomic with whatever caused the notification — see
 * `NotificationService` for why a warning must not fail because this table is
 * busy.
 *
 * **`emailEnabled` is resolved at delivery, not at raise.** The queue holds a
 * job for as long as it holds it; somebody who switched e-mail off in between
 * has said no more recently than the raise said yes.
 */
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
import { resultRows } from './result-rows'

interface RawNotification {
  id: number
  user_id: number
  kind: string
  data: unknown
  href: string | null
  occurrences: number
  /**
   * `string | Date` on purpose. A raw `sql` template does not go through
   * drizzle's typed-column decoding, so a timestamp arrives as whatever the
   * driver produced — a `Date` from postgres.js, a string from PGlite. Typing
   * it as `Date` is how a `toISOString is not a function` reaches production
   * (the same class of mismatch D54 records from the other direction).
   */
  created_at: string | Date
  updated_at: string | Date
  read_at: string | Date | null
}

/** Normalise whatever the driver returned for a timestamp. */
function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

function toNullableDate(value: string | Date | null): Date | null {
  return value === null ? null : toDate(value)
}

/**
 * `data` comes back as whatever the column holds.
 *
 * A row written by a previous deploy — or by an import — can hold a shape this
 * build does not expect, and the renderer is already written to survive missing
 * fields (see `render.ts`). What this must not do is hand it a non-object, so
 * anything else becomes an empty one.
 */
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

function encodeCursor(record: NotificationRecord): string {
  return Buffer.from(`${record.createdAt.toISOString()}|${record.id}`, 'utf8').toString(
    'base64url',
  )
}

function decodeCursor(value: string): { at: Date; id: number } | null {
  try {
    const [at, id] = Buffer.from(value, 'base64url').toString('utf8').split('|')
    if (at === undefined || id === undefined) return null
    const when = new Date(at)
    const numeric = Number(id)
    if (Number.isNaN(when.getTime()) || !Number.isSafeInteger(numeric)) return null
    return { at: when, id: numeric }
  } catch {
    return null
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

      /*
       * Two shapes, because `on conflict` cannot express "and never coalesce".
       * A null dedupe key is not merely absent from the partial index — the
       * insert must not name a conflict target at all, or Postgres has to infer
       * an index for a row that has no key to match on.
       */
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
      /* Unreachable: both branches insert or update exactly one row. */
      if (row === undefined) throw new Error('Notification insert returned no row')

      const notificationId = Number(row.id)
      /*
       * Coalescing is read off `occurrences` rather than from `xmax`: it means
       * the same thing, needs no system column, and cannot be misread by a
       * driver that does not expose one.
       */
      const coalesced = Number(row.occurrences) > 1

      /*
       * No second e-mail for a coalesced raise. A task failing every minute
       * would otherwise send a message every minute, and the row that survived
       * already carries the count — which is the whole point of coalescing.
       */
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
    options: { readonly limit: number; readonly after?: string },
  ): Promise<NotificationPage> {
    const cursor = options.after === undefined ? null : decodeCursor(options.after)
    /*
     * Newest first, so the cursor walks *backwards* through the keyset — the
     * one direction difference from every other paged read on the board, and
     * the reason this comparison is `<` where F49's is `>`.
     */
    const after = cursor
      ? sql`and (n.created_at, n.id) < (${cursor.at}, ${cursor.id})`
      : sql``

    const rows = resultRows(
      await this.db.execute(sql`
        ${SELECT_NOTIFICATION}
         where n.user_id = ${userId} ${after}
         order by n.created_at desc, n.id desc
         limit ${options.limit + 1}
      `),
    ) as RawNotification[]

    const page = rows.slice(0, options.limit).map(toRecord)
    const last = page.at(-1)
    return rows.length > options.limit && last
      ? { rows: page, nextCursor: encodeCursor(last) }
      : { rows: page }
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

  /**
   * Mark one read.
   *
   * The user id is in the WHERE clause rather than checked after a read, so
   * "not yours" and "does not exist" are the same answer and the endpoint
   * cannot be used to count the board's notifications. `read_at is null` makes
   * a double submit a no-op instead of moving the timestamp.
   */
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

  /**
   * Everything the mail job needs, in one statement.
   *
   * The join to `users` is what makes a deleted account a `null` return rather
   * than a message to a stale address — and the preference is read *here*, at
   * delivery time, rather than carried from the raise.
   */
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
    /*
     * A deleted account keeps its rows so post attribution stays coherent, but
     * it is emphatically not somewhere to send mail.
     */
    if (row.state === 'deleted') return null

    const spec = notificationKind(row.kind)

    return {
      notification: toRecord(row),
      recipient: {
        userId: Number(row.user_id),
        username: row.username,
        email: row.email,
      },
      /*
       * An unknown kind resolves to `false`: this build cannot render a message
       * for it, and a blank e-mail is worse than none.
       */
      emailEnabled: row.preference ?? spec?.emailByDefault ?? false,
      emailSentAt: toNullableDate(row.email_sent_at),
    }
  }

  async markEmailSent(notificationId: number, at: Date): Promise<void> {
    await this.db.execute(sql`
      update notifications set email_sent_at = ${at} where id = ${notificationId}
    `)
  }

  /**
   * Active accounts with administrative access.
   *
   * Resolved from the permission *column* rather than from a group id, which is
   * the rule F20's lint enforces everywhere else: "the administrators" is
   * whoever the board has granted `canAccessAdminCp` to, and a board that
   * renamed or replaced its administrator group must not stop receiving alerts
   * because a constant said `3`.
   *
   * The membership half is an `exists` over both routes to a group — primary
   * and secondary — because F15 makes those two different columns and a staff
   * member appointed through a secondary group is still staff.
   */
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
