import { sql } from 'drizzle-orm'

import type {
  AdminLogRepository,
  AdminLogRow,
  AdminSessionRecord,
  AdminSessionRepository,
} from '@meith/admin'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { toDate, toNullableDate } from './row-values'

interface RawSession {
  id: number
  user_id: number
  ip_prefix: string | null
  authenticated_at: string | Date
  last_seen_at: string | Date
  expires_at: string | Date
  revoked_at: string | Date | null
  created_at: string | Date
}

function toSession(row: RawSession): AdminSessionRecord {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    ipPrefix: row.ip_prefix,
    authenticatedAt: toDate(row.authenticated_at),
    lastSeenAt: toDate(row.last_seen_at),
    expiresAt: toDate(row.expires_at),
    revokedAt: toNullableDate(row.revoked_at),
    createdAt: toDate(row.created_at),
  }
}

const SESSION_COLUMNS = sql`
  id, user_id, ip_prefix, authenticated_at, last_seen_at,
  expires_at, revoked_at, created_at
`

export class PostgresAdminSessionRepository implements AdminSessionRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    readonly userId: number
    readonly tokenHash: string
    readonly ipPrefix: string | null
    readonly expiresAt: Date
    readonly at: Date
  }): Promise<AdminSessionRecord> {
    const rows = resultRows(
      await this.db.execute(sql`
        insert into admin_sessions
               (user_id, token_hash, ip_prefix, authenticated_at, last_seen_at,
                expires_at, created_at)
        values (${input.userId}, ${input.tokenHash}, ${input.ipPrefix}, ${input.at},
                ${input.at}, ${input.expiresAt}, ${input.at})
        returning ${SESSION_COLUMNS}
      `),
    ) as RawSession[]

    if (rows[0] === undefined) throw new Error('Admin session insert returned no row')
    return toSession(rows[0])
  }

  async findLive(tokenHash: string, now: Date): Promise<AdminSessionRecord | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select ${SESSION_COLUMNS}
          from admin_sessions
         where token_hash = ${tokenHash}
           and revoked_at is null
           and expires_at > ${now}
      `),
    ) as RawSession[]

    return rows[0] === undefined ? null : toSession(rows[0])
  }

  async touch(
    sessionId: number,
    now: Date,
    expiresAt: Date,
    windowSeconds: number,
  ): Promise<void> {
    const cutoff = new Date(now.getTime() - windowSeconds * 1000)
    await this.db.execute(sql`
      update admin_sessions
         set last_seen_at = ${now}, expires_at = ${expiresAt}
       where id = ${sessionId}
         and revoked_at is null
         and last_seen_at < ${cutoff}
    `)
  }

  async markReauthenticated(sessionId: number, at: Date): Promise<void> {
    await this.db.execute(sql`
      update admin_sessions
         set authenticated_at = ${at}, last_seen_at = ${at}
       where id = ${sessionId} and revoked_at is null
    `)
  }

  async revoke(sessionId: number, at: Date): Promise<void> {
    await this.db.execute(sql`
      update admin_sessions set revoked_at = ${at}
       where id = ${sessionId} and revoked_at is null
    `)
  }

  async revokeAllForUser(userId: number, at: Date): Promise<void> {
    await this.db.execute(sql`
      update admin_sessions set revoked_at = ${at}
       where user_id = ${userId} and revoked_at is null
    `)
  }
}

export const ACTION_FILTER_LIMIT = 1_000

export class PostgresAdminLogRepository implements AdminLogRepository {
  constructor(private readonly db: Database) {}

  async record(input: {
    readonly userId: number | null
    readonly action: string
    readonly detail: Readonly<Record<string, unknown>>
    readonly ipPrefix: string | null
    readonly at: Date
  }): Promise<void> {
    await this.db.execute(sql`
      insert into admin_log (user_id, action, detail, ip_prefix, created_at)
      values (${input.userId}, ${input.action}, ${JSON.stringify(input.detail)}::jsonb,
              ${input.ipPrefix}, ${input.at})
    `)
  }

  async list(input: {
    readonly limit: number
    readonly offset?: number | undefined
    readonly before?: number | undefined
    readonly action?: string | undefined
  }): Promise<readonly AdminLogRow[]> {
    const before = input.before === undefined ? sql`` : sql`and l.id < ${input.before}`
    const action =
      input.action === undefined || input.action === ''
        ? sql``
        : sql`and l.action = ${input.action}`

    const rows = resultRows(
      await this.db.execute(sql`
        select l.id, l.user_id, l.action, l.detail, l.ip_prefix, l.created_at,
               u.username
          from admin_log l
          left join users u on u.id = l.user_id
         where true ${before} ${action}
         order by l.id desc
         limit ${input.limit} offset ${input.offset ?? 0}
      `),
    ) as Array<{
      id: number
      user_id: number | null
      action: string
      detail: unknown
      ip_prefix: string | null
      created_at: string | Date
      username: string | null
    }>

    return rows.map((row) => ({
      id: Number(row.id),
      userId: row.user_id === null ? null : Number(row.user_id),
      username: row.username,
      action: row.action,
      detail:
        typeof row.detail === 'object' && row.detail !== null && !Array.isArray(row.detail)
          ? (row.detail as Record<string, unknown>)
          : {},
      ipPrefix: row.ip_prefix,
      createdAt: toDate(row.created_at),
    }))
  }

  async count(input: { readonly action?: string | undefined }): Promise<number> {
    const action =
      input.action === undefined || input.action === ''
        ? sql``
        : sql`and l.action = ${input.action}`

    const rows = resultRows(
      await this.db.execute(sql`
        select count(*)::int as total from admin_log l where true ${action}
      `),
    ) as Array<{ total: number }>

    return Number(rows[0]?.total ?? 0)
  }

  async actions(limit = ACTION_FILTER_LIMIT): Promise<readonly string[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select distinct action from admin_log order by action limit ${limit}
      `),
    ) as Array<{ action: string }>

    return rows.map((row) => row.action)
  }
}
