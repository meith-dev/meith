import { sql } from 'drizzle-orm'

import type { AvatarRepository, AvatarStatus, StoredAvatar } from '@meith/avatars'

import type { Database } from './client'
import { forgetOrphanKeys, rememberOrphanKey } from './orphan-keys'
import { resultRows } from './result-rows'
import { toNullableDate } from './row-values'

interface RawAvatar {
  id?: number
  avatar_status: string
  avatar_key: string | null
  avatar_source_key: string | null
  avatar_width: number | null
  avatar_height: number | null
  avatar_failure_reason: string | null
  avatar_updated_at: string | Date | null
  avatar_locked: boolean
  avatar_locked_reason: string | null
}

const STATUSES = ['none', 'pending', 'ready', 'failed'] as const

function toAvatar(row: RawAvatar): StoredAvatar {
  return {
    status: STATUSES.includes(row.avatar_status as AvatarStatus)
      ? (row.avatar_status as AvatarStatus)
      : 'failed',
    key: row.avatar_key,
    sourceKey: row.avatar_source_key,
    width: row.avatar_width === null ? null : Number(row.avatar_width),
    height: row.avatar_height === null ? null : Number(row.avatar_height),
    failureReason: row.avatar_failure_reason,
    updatedAt: toNullableDate(row.avatar_updated_at),
    locked: row.avatar_locked === true,
    lockedReason: row.avatar_locked_reason,
  }
}

const COLUMNS = sql`
  avatar_status, avatar_key, avatar_source_key, avatar_width, avatar_height,
  avatar_failure_reason, avatar_updated_at, avatar_locked, avatar_locked_reason
`

function droppedKeys(row: { avatar_key: string | null; avatar_source_key: string | null }) {
  return [row.avatar_key, row.avatar_source_key].filter((key): key is string => key !== null)
}

export class PostgresAvatarRepository implements AvatarRepository {
  constructor(private readonly db: Database) {}

  async find(userId: number): Promise<StoredAvatar | null> {
    const rows = resultRows(
      await this.db.execute(sql`select ${COLUMNS} from users where id = ${userId}`),
    ) as RawAvatar[]
    return rows[0] === undefined ? null : toAvatar(rows[0])
  }

  async readMany(userIds: readonly number[]): Promise<ReadonlyMap<number, StoredAvatar>> {
    if (userIds.length === 0) return new Map()

    const rows = resultRows(
      await this.db.execute(sql`
        select id, ${COLUMNS} from users
         where id in ${sql`(${sql.join(
           userIds.map((id) => sql`${id}`),
           sql`, `,
         )})`}
      `),
    ) as RawAvatar[]

    return new Map(rows.map((row) => [Number(row.id), toAvatar(row)]))
  }

  async beginUpload(input: {
    readonly userId: number
    readonly sourceKey: string
    readonly at: Date
  }): Promise<{ replaced: readonly string[] }> {
    return this.db.transaction(async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`
        with old as (
          select id, avatar_key, avatar_source_key from users
          where id = ${input.userId} and avatar_locked = false for update
        )
        update users u
           set avatar_source_key = ${input.sourceKey},
               avatar_key = null,
               avatar_status = 'pending',
               avatar_failure_reason = null,
               avatar_width = null,
               avatar_height = null,
               avatar_updated_at = ${input.at}
          from old where old.id = u.id
        returning old.avatar_key, old.avatar_source_key
      `),
      ) as Array<{ avatar_key: string | null; avatar_source_key: string | null }>

      const row = rows[0]
      if (row === undefined) return { replaced: [input.sourceKey] }
      const replaced = droppedKeys(row)
      for (const key of replaced) await rememberOrphanKey(tx, key)
      await forgetOrphanKeys(tx, [input.sourceKey])
      return { replaced }
    })
  }

  async markReady(input: {
    readonly userId: number
    readonly sourceKey: string
    readonly key: string
    readonly width: number
    readonly height: number
  }): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`
        update users set avatar_key = ${input.key}, avatar_source_key = null,
          avatar_width = ${input.width}, avatar_height = ${input.height}, avatar_status = 'ready'
        where id = ${input.userId} and avatar_status = 'pending' and avatar_source_key = ${input.sourceKey}
        returning id
      `),
      )
      if (rows.length === 0) return false
      await rememberOrphanKey(tx, input.sourceKey)
      await forgetOrphanKeys(tx, [input.key])
      return true
    })
  }

  async markFailed(userId: number, reason: string, sourceKey: string | null): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`
        update users set avatar_status = 'failed', avatar_failure_reason = ${reason}, avatar_source_key = null
        where id = ${userId} and avatar_status = 'pending' and avatar_source_key is not distinct from ${sourceKey}
        returning id
      `),
      )
      if (rows.length === 0) return false
      if (sourceKey !== null) await rememberOrphanKey(tx, sourceKey)
      return true
    })
  }

  async clear(userId: number): Promise<{ replaced: readonly string[] }> {
    return this.db.transaction(async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`
        with old as (
          select id, avatar_key, avatar_source_key from users
          where id = ${userId} and avatar_locked = false for update
        )
        update users u
           set avatar_key = null,
               avatar_source_key = null,
               avatar_status = 'none',
               avatar_failure_reason = null,
               avatar_width = null,
               avatar_height = null,
               avatar_updated_at = null
          from old where old.id = u.id
        returning old.avatar_key, old.avatar_source_key
      `),
      ) as Array<{ avatar_key: string | null; avatar_source_key: string | null }>

      const row = rows[0]
      const replaced = row === undefined ? [] : droppedKeys(row)
      for (const key of replaced) await rememberOrphanKey(tx, key)
      return { replaced }
    })
  }

  async lock(input: {
    readonly userId: number
    readonly locked: boolean
    readonly reason: string | null
  }): Promise<void> {
    await this.db.execute(sql`
      update users
         set avatar_locked = ${input.locked}, avatar_locked_reason = ${input.reason}
       where id = ${input.userId}
    `)
  }

  async stalled(before: Date, limit: number): Promise<readonly number[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select id from users
         where avatar_status = 'pending' and avatar_updated_at < ${before}
         order by avatar_updated_at
         limit ${limit}
      `),
    ) as Array<{ id: number }>
    return rows.map((row) => Number(row.id))
  }

  async rememberKey(key: string): Promise<void> {
    await rememberOrphanKey(this.db, key)
  }

  async forgetKeys(keys: readonly string[]): Promise<void> {
    await forgetOrphanKeys(this.db, keys)
  }
}
