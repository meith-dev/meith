import type { SQLWrapper } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

import type {
  ReputationRepository,
  ReputationRow,
  ReputationSummary,
} from '@meith/reputation'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { toDate } from './row-values'

interface RawRow {
  id: number
  user_id: number
  given_by_user_id: number | null
  given_by_username: string | null
  post_id: number | null
  thread_id: number | null
  points: number
  comment: string
  created_at: string | Date
  updated_at: string | Date
}

function toRow(row: RawRow): ReputationRow {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    givenByUserId: row.given_by_user_id === null ? null : Number(row.given_by_user_id),
    givenByUsername: row.given_by_username,
    postId: row.post_id === null ? null : Number(row.post_id),
    threadId: row.thread_id === null ? null : Number(row.thread_id),
    points: Number(row.points),
    comment: row.comment,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  }
}

const SELECT_ROW = sql`
  select r.id, r.user_id, r.given_by_user_id, r.post_id, r.points, r.comment,
         r.created_at, r.updated_at, u.username as given_by_username,
         p.thread_id
    from reputation r
    left join users u on u.id = r.given_by_user_id
    /* For the history's link. Left, because a profile rating has no post and a
       rated post may since have been hard-deleted. */
    left join posts p on p.id = r.post_id
`

interface ReputationTransaction {
  execute(query: SQLWrapper): Promise<unknown>
}

export async function recountReputation(
  tx: ReputationTransaction,
  userIds: readonly number[],
): Promise<void> {
  if (userIds.length === 0) return

  await tx.execute(sql`
    update users u
       set reputation = coalesce(
             (select sum(r.points)::int from reputation r where r.user_id = u.id), 0)
     where u.id in ${sql`(${sql.join(
       userIds.map((id) => sql`${id}`),
       sql`, `,
     )})`}
  `)
}

export class PostgresReputationRepository implements ReputationRepository {
  constructor(private readonly db: Database) {}

  async give(input: {
    readonly userId: number
    readonly givenByUserId: number
    readonly postId: number | null
    readonly points: number
    readonly comment: string
    readonly maxPerDay: number
    readonly at: Date
  }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      if (input.maxPerDay > 0) {
        const startOfDay = new Date(
          Date.UTC(
            input.at.getUTCFullYear(),
            input.at.getUTCMonth(),
            input.at.getUTCDate(),
          ),
        )

        const counted = resultRows(
          await tx.execute(sql`
            select count(*)::int as n
              from reputation
             where given_by_user_id = ${input.givenByUserId}
               and created_at >= ${startOfDay}
          `),
        ) as Array<{ n: number }>

        const already = Number(counted[0]?.n ?? 0)

        const existing = resultRows(
          await tx.execute(sql`
            select id from reputation
             where given_by_user_id = ${input.givenByUserId}
               and user_id = ${input.userId}
               and post_id is not distinct from ${input.postId}
          `),
        ) as Array<{ id: number }>

        if (existing.length === 0 && already >= input.maxPerDay) return false
      }

      if (input.postId === null) {
        await tx.execute(sql`
          insert into reputation
                 (user_id, given_by_user_id, post_id, points, comment, created_at, updated_at)
          values (${input.userId}, ${input.givenByUserId}, null, ${input.points},
                  ${input.comment}, ${input.at}, ${input.at})
              on conflict (given_by_user_id, user_id) where post_id is null
              do update set points = excluded.points,
                            comment = excluded.comment,
                            updated_at = excluded.updated_at
        `)
      } else {
        await tx.execute(sql`
          insert into reputation
                 (user_id, given_by_user_id, post_id, points, comment, created_at, updated_at)
          values (${input.userId}, ${input.givenByUserId}, ${input.postId}, ${input.points},
                  ${input.comment}, ${input.at}, ${input.at})
              on conflict (given_by_user_id, post_id) where post_id is not null
              do update set points = excluded.points,
                            comment = excluded.comment,
                            updated_at = excluded.updated_at
        `)
      }

      await recountReputation(tx, [input.userId])
      return true
    })
  }

  async withdraw(input: {
    readonly ratingId: number
    readonly givenByUserId: number
  }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`
          delete from reputation
           where id = ${input.ratingId} and given_by_user_id = ${input.givenByUserId}
          returning user_id
        `),
      ) as Array<{ user_id: number }>

      const row = rows[0]
      if (row === undefined) return false

      await recountReputation(tx, [Number(row.user_id)])
      return true
    })
  }

  async list(input: {
    readonly userId: number
    readonly limit: number
    readonly before?: number | undefined
  }): Promise<readonly ReputationRow[]> {
    const before = input.before === undefined ? sql`` : sql`and r.id < ${input.before}`

    const rows = resultRows(
      await this.db.execute(sql`
        ${SELECT_ROW}
         where r.user_id = ${input.userId} ${before}
         order by r.id desc
         limit ${input.limit}
      `),
    ) as RawRow[]

    return rows.map(toRow)
  }

  async summary(userId: number): Promise<ReputationSummary> {
    const rows = resultRows(
      await this.db.execute(sql`
        select coalesce(sum(points), 0)::int              as total,
               count(*) filter (where points > 0)::int    as positive,
               count(*) filter (where points = 0)::int    as neutral,
               count(*) filter (where points < 0)::int    as negative
          from reputation
         where user_id = ${userId}
      `),
    ) as Array<{ total: number; positive: number; neutral: number; negative: number }>

    const row = rows[0]
    return {
      total: Number(row?.total ?? 0),
      positive: Number(row?.positive ?? 0),
      neutral: Number(row?.neutral ?? 0),
      negative: Number(row?.negative ?? 0),
    }
  }

  async existing(input: {
    readonly givenByUserId: number
    readonly userId: number
    readonly postId: number | null
  }): Promise<ReputationRow | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        ${SELECT_ROW}
         where r.given_by_user_id = ${input.givenByUserId}
           and r.user_id = ${input.userId}
           /* "is not distinct from" so a null post id matches a null one:
              plain equality is never true against NULL, which would make every
              profile rating look like a new one. */
           and r.post_id is not distinct from ${input.postId}
      `),
    ) as RawRow[]

    return rows[0] === undefined ? null : toRow(rows[0])
  }

  async existingForPosts(input: {
    readonly givenByUserId: number
    readonly postIds: readonly number[]
  }): Promise<ReadonlyMap<number, ReputationRow>> {
    if (input.postIds.length === 0) return new Map()

    const rows = resultRows(
      await this.db.execute(sql`
        ${SELECT_ROW}
         where r.given_by_user_id = ${input.givenByUserId}
           and r.post_id in ${sql`(${sql.join(
             input.postIds.map((id) => sql`${id}`),
             sql`, `,
           )})`}
      `),
    ) as RawRow[]

    return new Map(
      rows.map(toRow).flatMap((row) => (row.postId === null ? [] : [[row.postId, row] as const])),
    )
  }

  async thanksForPosts(postIds: readonly number[]): Promise<ReadonlyMap<number, number>> {
    if (postIds.length === 0) return new Map()

    const rows = resultRows(
      await this.db.execute(sql`
        select post_id, count(*)::int as n
          from reputation
         where points > 0
           and post_id in ${sql`(${sql.join(
             postIds.map((id) => sql`${id}`),
             sql`, `,
           )})`}
         group by post_id
      `),
    ) as Array<{ post_id: number; n: number }>

    return new Map(rows.map((row) => [Number(row.post_id), Number(row.n)]))
  }

  async givenSince(givenByUserId: number, since: Date): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        select count(*)::int as n
          from reputation
         where given_by_user_id = ${givenByUserId} and created_at >= ${since}
      `),
    ) as Array<{ n: number }>

    return Number(rows[0]?.n ?? 0)
  }

  async recount(userId: number): Promise<number> {
    await recountReputation(this.db, [userId])

    const rows = resultRows(
      await this.db.execute(sql`select reputation from users where id = ${userId}`),
    ) as Array<{ reputation: number }>

    return Number(rows[0]?.reputation ?? 0)
  }
}
