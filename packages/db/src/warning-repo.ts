import { sql } from 'drizzle-orm'

import type {
  PostingRestriction,
  WarningLevel,
  WarningPage,
  WarningRepository,
  WarningRow,
  WarningType,
} from '@meith/moderation'
import { parseWarningAction } from '@meith/moderation'

import type { Database } from './client'
import { decodeCursor, encodeCursor } from './cursor'
import { resultRows } from './result-rows'

interface Tx {
  execute(query: ReturnType<typeof sql>): Promise<unknown>
}

const LIVE = sql`revoked_at is null and (expires_at is null or expires_at > now())`

export async function recalculateWarningPoints(tx: Tx, userId: number): Promise<number> {
  const rows = resultRows(
    await tx.execute(sql`
      update users u
         set warning_points = coalesce((
               select sum(w.points)::int from warnings w
                where w.user_id = ${userId} and ${LIVE}
             ), 0),
             updated_at = now()
       where u.id = ${userId}
       returning u.warning_points
    `),
  ) as Array<{ warning_points: number }>
  return Number(rows[0]?.warning_points ?? 0)
}

function toRow(row: {
  id: number
  user_id: number
  title: string
  points: number
  reason: string
  issued_by_user_id: number | null
  issued_by_username: string | null
  post_id: number | null
  created_at: Date
  expires_at: Date | null
  revoked_at: Date | null
  revoked_by_username: string | null
  revoke_reason: string | null
}): WarningRow {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    title: row.title,
    points: Number(row.points),
    reason: row.reason,
    issuedByUserId: row.issued_by_user_id === null ? null : Number(row.issued_by_user_id),
    issuedByUsername: row.issued_by_username,
    postId: row.post_id === null ? null : Number(row.post_id),
    createdAt: new Date(row.created_at),
    expiresAt: row.expires_at === null ? null : new Date(row.expires_at),
    revokedAt: row.revoked_at === null ? null : new Date(row.revoked_at),
    revokedByUsername: row.revoked_by_username,
    revokeReason: row.revoke_reason,
  }
}

export class PostgresWarningRepository implements WarningRepository {
  constructor(private readonly db: Database) {}

  async listTypes(): Promise<readonly WarningType[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, title, points, expiry_days from warning_types
         where is_active = true
         order by display_order, id
      `),
    ) as Array<{ id: number; title: string; points: number; expiry_days: number | null }>

    return rows.map((row) => ({
      id: Number(row.id),
      title: row.title,
      points: Number(row.points),
      expiryDays: row.expiry_days === null ? null : Number(row.expiry_days),
    }))
  }

  async listLevels(): Promise<readonly WarningLevel[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select points, action, duration_days from warning_levels order by points
      `),
    ) as Array<{ points: number; action: string; duration_days: number | null }>

    return rows.flatMap((row) => {
      const action = parseWarningAction(row.action)
      return action === null
        ? []
        : [
            {
              points: Number(row.points),
              action,
              durationDays: row.duration_days === null ? null : Number(row.duration_days),
            },
          ]
    })
  }

  async findType(typeId: number): Promise<WarningType | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, title, points, expiry_days from warning_types
         where id = ${typeId} and is_active = true
      `),
    ) as Array<{ id: number; title: string; points: number; expiry_days: number | null }>
    const row = rows[0]
    if (!row) return null
    return {
      id: Number(row.id),
      title: row.title,
      points: Number(row.points),
      expiryDays: row.expiry_days === null ? null : Number(row.expiry_days),
    }
  }

  async findWarnable(userId: number): Promise<{ id: number; username: string } | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id, username from users where id = ${userId} and state <> 'deleted'
      `),
    ) as Array<{ id: number; username: string }>
    const row = rows[0]
    return row === undefined ? null : { id: Number(row.id), username: row.username }
  }

  async findPostAuthor(postId: number): Promise<number | null> {
    const rows = resultRows(
      await this.db.execute(sql`select author_user_id from posts where id = ${postId}`),
    ) as Array<{ author_user_id: number | null }>
    const row = rows[0]
    return row === undefined || row.author_user_id === null ? null : Number(row.author_user_id)
  }

  async issue(input: {
    readonly userId: number
    readonly issuedByUserId: number
    readonly typeId: number | null
    readonly title: string
    readonly points: number
    readonly reason: string
    readonly postId: number | null
    readonly expiresAt: Date | null
    readonly at: Date
  }): Promise<{ warningId: number; points: number }> {
    return this.db.transaction(async (tx) => {
      const written = resultRows(
        await tx.execute(sql`
          insert into warnings
            (user_id, issued_by_user_id, type_id, title, points, reason, post_id,
             created_at, expires_at)
          values
            (${input.userId}, ${input.issuedByUserId}, ${input.typeId}, ${input.title},
             ${input.points}, ${input.reason}, ${input.postId}, ${input.at},
             ${input.expiresAt})
          returning id
        `),
      ) as Array<{ id: number }>

      const points = await recalculateWarningPoints(tx, input.userId)

      await tx.execute(sql`
        insert into admin_log (user_id, action, detail, created_at)
        values (
          ${input.issuedByUserId},
          'warning.issue',
          ${JSON.stringify({
            warningId: Number(written[0]!.id),
            userId: input.userId,
            points: input.points,
            total: points,
          })}::jsonb,
          ${input.at}
        )
      `)

      return { warningId: Number(written[0]!.id), points }
    })
  }

  async revoke(input: {
    readonly warningId: number
    readonly actorUserId: number
    readonly reason: string
    readonly at: Date
  }): Promise<{ userId: number; points: number } | null> {
    return this.db.transaction(async (tx) => {
      const moved = resultRows(
        await tx.execute(sql`
          update warnings
             set revoked_at = ${input.at},
                 revoked_by_user_id = ${input.actorUserId},
                 revoke_reason = ${input.reason}
           where id = ${input.warningId} and revoked_at is null
           returning user_id
        `),
      ) as Array<{ user_id: number }>
      const row = moved[0]
      if (!row) return null

      const userId = Number(row.user_id)
      const points = await recalculateWarningPoints(tx, userId)

      await tx.execute(sql`
        insert into admin_log (user_id, action, detail, created_at)
        values (
          ${input.actorUserId},
          'warning.revoke',
          ${JSON.stringify({ warningId: input.warningId, userId, total: points })}::jsonb,
          ${input.at}
        )
      `)

      return { userId, points }
    })
  }

  async pointsFor(userId: number): Promise<number> {
    return this.db.transaction(async (tx) => recalculateWarningPoints(tx, userId))
  }

  async readRestriction(userId: number): Promise<PostingRestriction> {
    const rows = resultRows(
      await this.db.execute(sql`
        select suspended_posting_until, moderated_posting_until
          from users where id = ${userId}
      `),
    ) as Array<{
      suspended_posting_until: Date | null
      moderated_posting_until: Date | null
    }>
    const row = rows[0]
    if (!row) return { suspendedUntil: null, moderatedUntil: null }
    return {
      suspendedUntil:
        row.suspended_posting_until === null ? null : new Date(row.suspended_posting_until),
      moderatedUntil:
        row.moderated_posting_until === null ? null : new Date(row.moderated_posting_until),
    }
  }

  async applyRestriction(input: {
    readonly userId: number
    readonly restriction: PostingRestriction
    readonly at: Date
  }): Promise<void> {
    await this.db.execute(sql`
      update users
         set suspended_posting_until = ${input.restriction.suspendedUntil},
             moderated_posting_until = ${input.restriction.moderatedUntil},
             updated_at = now()
       where id = ${input.userId}
    `)
  }

  async history(
    userId: number,
    options: { readonly limit: number; readonly after?: string },
  ): Promise<WarningPage> {
    const cursor = options.after === undefined ? null : decodeCursor(options.after)
    const after = cursor
      ? sql`and (w.created_at, w.id) < (${cursor.at}, ${cursor.id})`
      : sql``

    const rows = resultRows(
      await this.db.execute(sql`
        select w.id, w.user_id, w.title, w.points, w.reason,
               w.issued_by_user_id, issuer.username as issued_by_username,
               w.post_id, w.created_at, w.expires_at,
               w.revoked_at, revoker.username as revoked_by_username, w.revoke_reason
          from warnings w
          left join users issuer on issuer.id = w.issued_by_user_id
          left join users revoker on revoker.id = w.revoked_by_user_id
         where w.user_id = ${userId} ${after}
         order by w.created_at desc, w.id desc
         limit ${options.limit + 1}
      `),
    ) as Parameters<typeof toRow>[0][]

    const mapped = rows.slice(0, options.limit).map(toRow)
    const last = mapped.at(-1)
    return rows.length > options.limit && last
      ? { rows: mapped, nextCursor: encodeCursor(last.createdAt, last.id) }
      : { rows: mapped }
  }

  async expireDue(
    now: Date,
    limit: number,
  ): Promise<{ expired: number; userIds: readonly number[] }> {
    const rows = resultRows(
      await this.db.execute(sql`
        select w.id, w.user_id
          from warnings w
          join users u on u.id = w.user_id
         where w.revoked_at is null
           and w.expires_at is not null
           and w.expires_at <= ${now}
           /*
            * Only the members whose cached total still counts this warning.
            * Without it, every past expiry on the board is rediscovered on
            * every tick and the sweep never reaches the newest ones.
            */
           and u.warning_points > coalesce((
                 select sum(x.points)::int from warnings x
                  where x.user_id = w.user_id and ${LIVE}
               ), 0)
         order by w.expires_at
         limit ${limit}
      `),
    ) as Array<{ id: number; user_id: number }>

    return {
      expired: rows.length,
      userIds: [...new Set(rows.map((row) => Number(row.user_id)))],
    }
  }
}
