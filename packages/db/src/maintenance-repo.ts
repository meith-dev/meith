import { and, isNotNull, lt, or, sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { credentialTokens, sessions } from './schema'

export class PostgresMaintenanceRepository {
  constructor(private readonly db: Database) {}

  async pruneSessions(now: Date, limit = 5000, revokedGraceHours = 24): Promise<number> {
    const revokedBefore = new Date(now.getTime() - revokedGraceHours * 3_600_000)

    const result = await this.db.execute(sql`
      delete from ${sessions}
       where id in (
         select id from ${sessions}
          where expires_at <= ${now}
             or (revoked_at is not null and revoked_at <= ${revokedBefore})
          limit ${limit}
       )
      returning id
    `)

    return resultRows(result).length
  }

  async pruneExpiredTokens(now: Date, limit = 5000): Promise<number> {
    const result = await this.db.execute(sql`
      delete from ${credentialTokens}
       where id in (
         select id from ${credentialTokens}
          where expires_at <= ${now} or consumed_at is not null
          limit ${limit}
       )
      returning id
    `)

    return resultRows(result).length
  }

  async countPrunableSessions(now: Date, revokedGraceHours = 24): Promise<number> {
    const revokedBefore = new Date(now.getTime() - revokedGraceHours * 3_600_000)
    const rows = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        or(
          lt(sessions.expiresAt, now),
          and(isNotNull(sessions.revokedAt), lt(sessions.revokedAt, revokedBefore)),
        ),
      )
    return rows.length
  }
}
