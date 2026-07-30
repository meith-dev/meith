/**
 * Housekeeping deletes for the scheduled tasks (F06/R9).
 *
 * Separate from the account repositories because these are *operational*, not
 * part of any request path: nothing in a login flow prunes a table. Keeping
 * them apart means the account ports stay a description of what identity needs,
 * rather than accumulating verbs only a cron job uses.
 */
import { and, isNotNull, lt, or, sql } from 'drizzle-orm'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { credentialTokens, sessions } from './schema'

export class PostgresMaintenanceRepository {
  constructor(private readonly db: Database) {}

  /**
   * Delete sessions that are expired or long revoked.
   *
   * Revoked rows are kept for a grace period rather than dropped immediately:
   * `supersede` points a rotated session at its replacement, and deleting the
   * old row the instant it is revoked would break that chain while a concurrent
   * request may still be reading it. A day is far longer than any request.
   *
   * Bounded per run (invariant 18) — a board that has not pruned in months must
   * not try to delete a million rows in one function invocation.
   */
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

  /**
   * Delete consumed or expired credential tokens (activation, password reset).
   *
   * These are single-use and short-lived, so there is nothing to preserve once
   * they are past it — and leaving them is a slowly growing table of
   * password-reset hashes, which is a liability rather than merely untidy.
   */
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

  /** Exposed for a test that needs the same predicate without deleting. */
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
