/**
 * F62 — reputation over Postgres.
 *
 * Two things in this file carry the feature.
 *
 * **`give` is one transaction that ends in a recount.** The cap is counted, the
 * row is written or updated, and `users.reputation` is rebuilt from the live
 * rows — all three inside it. Recomputing rather than incrementing is what lets
 * a rating be revised or withdrawn without the cached total drifting, and it is
 * the same decision F53 made for `warning_points`.
 *
 * **The uniqueness is the index, not a read.** `on conflict` names the partial
 * unique index for whichever shape is being written, so two clicks arriving
 * together produce one row and the second updates it — rather than both passing
 * a check and inserting.
 */
import { sql } from 'drizzle-orm'

import type {
  ReputationRepository,
  ReputationRow,
  ReputationSummary,
} from '@meith/reputation'

import type { Database } from './client'
import { resultRows } from './result-rows'

/** PGlite hands raw templates timestamps as strings; postgres.js hands Dates. */
function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

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

/**
 * Rebuild one member's cached total, in whatever transaction is running.
 *
 * A `sum` over the live rows, coalesced — a member with no ratings has no rows
 * to sum, and `NULL` written into a NOT NULL column is a constraint violation
 * on the happy path of somebody withdrawing their only rating.
 */
function recountInto(tx: Database, userId: number) {
  return tx.execute(sql`
    update users
       set reputation = coalesce(
             (select sum(points)::int from reputation where user_id = ${userId}), 0)
     where id = ${userId}
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
      /*
       * The cap, counted inside the transaction so the count and the write see
       * one state. It deliberately counts *distinct rows written today*, not
       * points: revising an existing rating is not a new one, which is why the
       * count is against `created_at` rather than `updated_at`.
       */
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

        /*
         * An *existing* rating being revised does not count against the cap:
         * changing your mind is a thing the feature supports, and making it
         * cost an allowance would push people to leave a wrong rating alone.
         */
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

      /*
       * `on conflict` names the partial index for this shape. Two of them exist
       * and only one applies to a given row, so the target has to be spelled
       * out per shape rather than inferred.
       */
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

      await recountInto(tx as unknown as Database, input.userId)
      return true
    })
  }

  /**
   * Withdraw a rating.
   *
   * Scoped to the member who gave it **in the query**, so a rating id from
   * somebody else's history matches nothing rather than being caught by a
   * check — the same rule F60's mailbox follows.
   */
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

      await recountInto(tx as unknown as Database, Number(row.user_id))
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

  /**
   * The batch form of `existing`, for a thread page's Thanks controls.
   *
   * Scoped to the *rater* in the `where` clause rather than filtered after the
   * read, like every other query here: what this reader has said is theirs, and
   * a query that fetched everybody's ratings and picked out one member's would
   * be one refactor away from showing the wrong ones.
   *
   * `post_id in (...)` rather than `is not distinct from`, because a profile
   * rating has a null post id and is not what this asks about — the caller is
   * always holding a page of posts.
   */
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

  /**
   * The thanks count per post, for a page of them.
   *
   * `points > 0` rather than `sum(points)`: this is a count of people, and a
   * sum would let one negative cancel one thanks — showing "2" on a post that
   * three people thanked, which is not a thing anybody said.
   */
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
    await recountInto(this.db, userId)

    const rows = resultRows(
      await this.db.execute(sql`select reputation from users where id = ${userId}`),
    ) as Array<{ reputation: number }>

    return Number(rows[0]?.reputation ?? 0)
  }
}
