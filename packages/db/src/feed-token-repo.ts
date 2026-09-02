import { sql } from 'drizzle-orm'

import type { FeedTokenRecord } from '@meith/api'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { toDate } from './row-values'

export interface FeedTokenSummary {
  readonly userId: number
  readonly lookup: string
  readonly createdAt: Date
  readonly lastUsedAt: Date | null
}

const TOUCH_INTERVAL_MS = 60_000

export class PostgresFeedTokenRepository {
  constructor(private readonly db: Database) {}

  async findByLookup(lookup: string): Promise<FeedTokenRecord | null> {
    const rows = resultRows<{
      id: number
      user_id: number
      lookup: string
      secret_hash: string
    }>(
      await this.db.execute(sql`
        select id, user_id, lookup, secret_hash
        from feed_tokens
        where lookup = ${lookup}
        limit 1
      `),
    )

    const row = rows[0]
    if (row === undefined) return null

    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      lookup: row.lookup,
      secretHash: row.secret_hash,
    }
  }

  async summaryForUser(userId: number): Promise<FeedTokenSummary | null> {
    const rows = resultRows<{
      user_id: number
      lookup: string
      created_at: Date | string
      last_used_at: Date | string | null
    }>(
      await this.db.execute(sql`
        select user_id, lookup, created_at, last_used_at
        from feed_tokens
        where user_id = ${userId}
        limit 1
      `),
    )

    const row = rows[0]
    if (row === undefined) return null

    return {
      userId: Number(row.user_id),
      lookup: row.lookup,
      createdAt: toDate(row.created_at),
      lastUsedAt: row.last_used_at === null ? null : toDate(row.last_used_at),
    }
  }

  async regenerate(input: {
    readonly userId: number
    readonly lookup: string
    readonly secretHash: string
  }): Promise<void> {
    await this.db.execute(sql`
      insert into feed_tokens (user_id, lookup, secret_hash, created_at, last_used_at)
      values (${input.userId}, ${input.lookup}, ${input.secretHash}, now(), null)
      on conflict (user_id) do update
        set lookup = excluded.lookup,
            secret_hash = excluded.secret_hash,
            created_at = now(),
            last_used_at = null
    `)
  }

  async revokeForUser(userId: number): Promise<void> {
    await this.db.execute(sql`
      delete from feed_tokens where user_id = ${userId}
    `)
  }

  async touch(id: number, at: Date): Promise<void> {
    await this.db.execute(sql`
      update feed_tokens
      set last_used_at = ${at}
      where id = ${id}
        and (last_used_at is null or last_used_at < ${new Date(at.getTime() - TOUCH_INTERVAL_MS)})
    `)
  }
}
