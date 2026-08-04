/**
 * F58's avatars over Postgres.
 *
 * Nine columns on `users` and seven small statements. Three things are worth
 * reading.
 *
 * **Every write that stops pointing at an object returns the key it dropped.**
 * `beginUpload` and `clear` both use `RETURNING` on the *old* values, so the
 * caller can hand them to the sweep in the same breath. Reading first and then
 * writing would leave a window in which two requests both believe they own the
 * old object and one of them deletes it out from under the other.
 *
 * **`markReady` clears the source key in the statement that sets the real one**,
 * exactly as `attachment-repo.ts` does, and guards on `avatar_status =
 * 'pending'` so an at-least-once queue delivering twice is a no-op.
 *
 * **`readMany` answers a whole page of postbits in one query.** An avatar per
 * post would be an N+1 on the board's heaviest page, which is the same reason
 * `signature-repo.ts` has one.
 */
import { sql } from 'drizzle-orm'

import type { AvatarRepository, AvatarStatus, StoredAvatar } from '@meith/avatars'

import type { Database } from './client'
import { resultRows } from './result-rows'

function toDate(value: string | Date | null): Date | null {
  if (value === null) return null
  return value instanceof Date ? value : new Date(value)
}

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
    /*
     * Narrowed rather than asserted. The column is text and a row written by a
     * previous deploy could hold anything; an unknown status reads as `failed`,
     * which is the only safe default — it is the one value that serves nothing.
     */
    status: STATUSES.includes(row.avatar_status as AvatarStatus)
      ? (row.avatar_status as AvatarStatus)
      : 'failed',
    key: row.avatar_key,
    sourceKey: row.avatar_source_key,
    width: row.avatar_width === null ? null : Number(row.avatar_width),
    height: row.avatar_height === null ? null : Number(row.avatar_height),
    failureReason: row.avatar_failure_reason,
    updatedAt: toDate(row.avatar_updated_at),
    locked: row.avatar_locked === true,
    lockedReason: row.avatar_locked_reason,
  }
}

const COLUMNS = sql`
  avatar_status, avatar_key, avatar_source_key, avatar_width, avatar_height,
  avatar_failure_reason, avatar_updated_at, avatar_locked, avatar_locked_reason
`

/** The keys a row was pointing at, minus the nulls. */
function droppedKeys(row: { avatar_key: string | null; avatar_source_key: string | null }) {
  return [row.avatar_key, row.avatar_source_key].filter(
    (key): key is string => key !== null,
  )
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

  /**
   * Point the row at a new upload, and say what it stopped pointing at.
   *
   * `RETURNING` the *old* values is what makes the handover atomic: a
   * read-then-write would let two concurrent uploads both see the same previous
   * key and both try to delete it.
   */
  async beginUpload(input: {
    readonly userId: number
    readonly sourceKey: string
    readonly at: Date
  }): Promise<{ replaced: readonly string[] }> {
    const rows = resultRows(
      await this.db.execute(sql`
        update users u
           set avatar_source_key = ${input.sourceKey},
               avatar_key = null,
               avatar_status = 'pending',
               avatar_failure_reason = null,
               avatar_width = null,
               avatar_height = null,
               avatar_updated_at = ${input.at}
          from users old
         where u.id = ${input.userId}
           and old.id = u.id
           and u.avatar_locked = false
        returning old.avatar_key, old.avatar_source_key
      `),
    ) as Array<{ avatar_key: string | null; avatar_source_key: string | null }>

    const row = rows[0]
    /*
     * No row means the lock won the race — somebody locked the avatar between
     * the service's check and this statement. Nothing was written, so the
     * caller's freshly stored object is the thing to collect.
     */
    if (row === undefined) return { replaced: [input.sourceKey] }
    return { replaced: droppedKeys(row) }
  }

  async markReady(input: {
    readonly userId: number
    readonly key: string
    readonly width: number
    readonly height: number
  }): Promise<void> {
    await this.db.execute(sql`
      update users
         set avatar_key = ${input.key},
             avatar_source_key = null,
             avatar_width = ${input.width},
             avatar_height = ${input.height},
             avatar_status = 'ready'
       where id = ${input.userId} and avatar_status = 'pending'
    `)
  }

  async markFailed(userId: number, reason: string): Promise<void> {
    await this.db.execute(sql`
      update users
         set avatar_status = 'failed',
             avatar_failure_reason = ${reason},
             avatar_source_key = null
       where id = ${userId} and avatar_status = 'pending'
    `)
  }

  async clear(userId: number): Promise<{ replaced: readonly string[] }> {
    const rows = resultRows(
      await this.db.execute(sql`
        update users u
           set avatar_key = null,
               avatar_source_key = null,
               avatar_status = 'none',
               avatar_failure_reason = null,
               avatar_width = null,
               avatar_height = null,
               avatar_updated_at = null
          from users old
         where u.id = ${userId}
           and old.id = u.id
           and u.avatar_locked = false
        returning old.avatar_key, old.avatar_source_key
      `),
    ) as Array<{ avatar_key: string | null; avatar_source_key: string | null }>

    const row = rows[0]
    return { replaced: row === undefined ? [] : droppedKeys(row) }
  }

  /**
   * Lock or unlock.
   *
   * Deliberately the only statement here with no `avatar_locked = false` guard:
   * it is the moderator's, and it is what changes that column.
   */
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

  /**
   * The object ledger, shared with F42.
   *
   * `attachment_orphans` by name because that is where it started; what it
   * holds is "object keys nothing owns", and an avatar replaced by a new one is
   * the second thing to need exactly that. A second identical table would be
   * worse than a name one feature out of date.
   */
  async rememberKey(key: string): Promise<void> {
    await this.db.execute(sql`
      insert into attachment_orphans (storage_key) values (${key})
      on conflict (storage_key) do nothing
    `)
  }

  async forgetKeys(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return
    await this.db.execute(sql`
      delete from attachment_orphans
       where storage_key in ${sql`(${sql.join(
         keys.map((key) => sql`${key}`),
         sql`, `,
       )})`}
    `)
  }
}
