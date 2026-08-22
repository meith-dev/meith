import { sql } from 'drizzle-orm'

import { ValidationError } from '@meith/core'

import type { Database } from './client'
import { resultRows } from './result-rows'
import { toDate, toNullableDate } from './row-values'

export const ADMIN_UNDO_MAX_SNAPSHOT_BYTES = 64 * 1024

export interface AdminUndoOperation {
  readonly id: number
  readonly actorUserId: number
  readonly operation: string
  readonly snapshot: Readonly<Record<string, unknown>>
  readonly createdAt: Date
  readonly expiresAt: Date
  readonly consumedAt: Date | null
}

interface RawUndoOperation {
  id: number
  actor_user_id: number
  operation: string
  snapshot: unknown
  created_at: string | Date
  expires_at: string | Date
  consumed_at: string | Date | null
}

function mapped(row: RawUndoOperation): AdminUndoOperation {
  const snapshot =
    typeof row.snapshot === 'object' && row.snapshot !== null && !Array.isArray(row.snapshot)
      ? (row.snapshot as Record<string, unknown>)
      : {}

  return {
    id: Number(row.id),
    actorUserId: Number(row.actor_user_id),
    operation: row.operation,
    snapshot,
    createdAt: toDate(row.created_at),
    expiresAt: toDate(row.expires_at),
    consumedAt: toNullableDate(row.consumed_at),
  }
}

const COLUMNS = sql`
  id, actor_user_id, operation, snapshot, created_at, expires_at, consumed_at
`

export class PostgresAdminUndoRepository {
  constructor(private readonly db: Database) {}

  async create(input: {
    readonly tokenHash: string
    readonly actorUserId: number
    readonly operation: string
    readonly snapshot: Readonly<Record<string, unknown>>
    readonly createdAt: Date
    readonly expiresAt: Date
  }): Promise<void> {
    const encoded = JSON.stringify(input.snapshot)
    if (Buffer.byteLength(encoded, 'utf8') > ADMIN_UNDO_MAX_SNAPSHOT_BYTES) {
      throw new ValidationError('The undo snapshot is too large.')
    }

    await this.db.execute(sql`
      insert into admin_undo_operations
             (token_hash, actor_user_id, operation, snapshot, created_at, expires_at)
      values (${input.tokenHash}, ${input.actorUserId}, ${input.operation},
              ${encoded}::jsonb, ${input.createdAt}, ${input.expiresAt})
    `)
  }

  async findLive(input: {
    readonly tokenHash: string
    readonly actorUserId: number
    readonly now: Date
  }): Promise<AdminUndoOperation | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select ${COLUMNS}
          from admin_undo_operations
         where token_hash = ${input.tokenHash}
           and actor_user_id = ${input.actorUserId}
           and consumed_at is null
           and expires_at > ${input.now}
      `),
    ) as RawUndoOperation[]

    return rows[0] === undefined ? null : mapped(rows[0])
  }

  async claim(input: {
    readonly tokenHash: string
    readonly actorUserId: number
    readonly now: Date
  }): Promise<AdminUndoOperation | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        update admin_undo_operations
           set consumed_at = ${input.now}
         where token_hash = ${input.tokenHash}
           and actor_user_id = ${input.actorUserId}
           and consumed_at is null
           and expires_at > ${input.now}
        returning ${COLUMNS}
      `),
    ) as RawUndoOperation[]

    return rows[0] === undefined ? null : mapped(rows[0])
  }

  async removeExpired(now: Date, limit = 500): Promise<number> {
    const rows = resultRows(
      await this.db.execute(sql`
        delete from admin_undo_operations
         where id in (
           select id from admin_undo_operations
            where expires_at <= ${now}
            order by expires_at
            limit ${limit}
         )
        returning id
      `),
    )
    return rows.length
  }
}
