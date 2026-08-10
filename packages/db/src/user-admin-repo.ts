import { sql, type SQL } from 'drizzle-orm'

import { ValidationError } from '@meith/core'

import type { Database } from './client'
import { withPermissionVersionBump } from './permission-version'
import { resultRows } from './result-rows'

export type AccountState = 'active' | 'awaiting_activation' | 'banned'

const STATES: readonly AccountState[] = ['active', 'awaiting_activation', 'banned']

export const BANNED_PREDICATE: SQL = sql`(u.state = 'banned' or exists (
  select 1 from bans b where b.user_id = u.id and b.lifted_at is null
))`

export interface UserSearchFilter {
  readonly username?: string | undefined
  readonly email?: string | undefined
  readonly ipPrefix?: string | undefined
  readonly primaryGroupId?: number | undefined
  readonly state?: AccountState | undefined
  readonly registeredBefore?: Date | undefined
  readonly registeredAfter?: Date | undefined
  readonly minPostCount?: number | undefined
  readonly maxPostCount?: number | undefined
  readonly includeDeleted?: boolean | undefined
  readonly afterUserId: number
  readonly limit: number
}

export interface UserSearchRow {
  readonly id: number
  readonly username: string
  readonly email: string
  readonly state: AccountState
  readonly isBanned: boolean
  readonly primaryGroupId: number
  readonly primaryGroupTitle: string
  readonly postCount: number
  readonly reputation: number
  readonly warningPoints: number
  readonly registrationIpPrefix: string | null
  readonly lastIpPrefix: string | null
  readonly lastActiveAt: Date | null
  readonly createdAt: Date
  readonly deletedAt: Date | null
}

export interface UserSearchPage {
  readonly rows: readonly UserSearchRow[]
  readonly nextCursor: number | null
}

export interface UserDetail extends UserSearchRow {
  readonly displayGroupId: number | null
  readonly emailVerifiedAt: Date | null
  readonly passwordChangedAt: Date | null
  readonly threadCount: number
  readonly legacyMybbUid: number | null
}

export interface UserAccountInput {
  readonly username: string
  readonly email: string
  readonly primaryGroupId: number
  readonly displayGroupId: number | null
}

export function likeFragment(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

function fold(value: string): string {
  return value.trim().toLowerCase()
}

function assertState(state: string): AccountState {
  if (!STATES.includes(state as AccountState)) {
    throw new ValidationError('No such account state.')
  }
  return state as AccountState
}

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value : new Date(String(value))
}

function toSearchRow(row: Record<string, unknown>): UserSearchRow {
  return {
    id: Number(row.id),
    username: String(row.username),
    email: String(row.email),
    state: assertState(String(row.state)),
    isBanned: row.is_banned === true || row.is_banned === 't',
    primaryGroupId: Number(row.primary_group_id),
    primaryGroupTitle: String(row.primary_group_title ?? ''),
    postCount: Number(row.post_count),
    reputation: Number(row.reputation),
    warningPoints: Number(row.warning_points),
    registrationIpPrefix:
      row.registration_ip_prefix === null ? null : String(row.registration_ip_prefix),
    lastIpPrefix: row.last_ip_prefix === null ? null : String(row.last_ip_prefix),
    lastActiveAt: toDate(row.last_active_at),
    createdAt: toDate(row.created_at) as Date,
    deletedAt: toDate(row.deleted_at),
  }
}

export class PostgresUserAdminRepository {
  constructor(private readonly db: Database) {}

  async search(filter: UserSearchFilter): Promise<UserSearchPage> {
    const conditions: SQL[] = [sql`u.id > ${filter.afterUserId}`]

    if (filter.username !== undefined && filter.username.trim() !== '') {
      conditions.push(
        sql`u.username_lower like ${`%${likeFragment(fold(filter.username))}%`} escape '\\'`,
      )
    }
    if (filter.email !== undefined && filter.email.trim() !== '') {
      conditions.push(
        sql`u.email_lower like ${`%${likeFragment(fold(filter.email))}%`} escape '\\'`,
      )
    }
    if (filter.ipPrefix !== undefined && filter.ipPrefix.trim() !== '') {
      const pattern = `${likeFragment(filter.ipPrefix.trim())}%`
      conditions.push(
        sql`(u.registration_ip_prefix like ${pattern} escape '\\'
             or u.last_ip_prefix like ${pattern} escape '\\')`,
      )
    }
    // eslint-disable-next-line no-restricted-properties -- filtering on a column, not deciding access
    if (filter.primaryGroupId !== undefined) {
      // eslint-disable-next-line no-restricted-properties -- filtering on a column, not deciding access
      conditions.push(sql`u.primary_group_id = ${filter.primaryGroupId}`)
    }
    if (filter.state !== undefined) {
      const state = assertState(filter.state)
      conditions.push(
        state === 'banned'
          ? BANNED_PREDICATE
          : sql`u.state = ${state} and not ${BANNED_PREDICATE}`,
      )
    }
    if (filter.registeredAfter !== undefined) {
      conditions.push(sql`u.created_at >= ${filter.registeredAfter}`)
    }
    if (filter.registeredBefore !== undefined) {
      conditions.push(sql`u.created_at < ${filter.registeredBefore}`)
    }
    if (filter.minPostCount !== undefined) {
      conditions.push(sql`u.post_count >= ${filter.minPostCount}`)
    }
    if (filter.maxPostCount !== undefined) {
      conditions.push(sql`u.post_count <= ${filter.maxPostCount}`)
    }
    if (filter.includeDeleted !== true) {
      conditions.push(sql`u.deleted_at is null`)
    }

    const rows = resultRows(
      await this.db.execute(sql`
        select u.id, u.username, u.email, u.state, u.primary_group_id,
               g.title as primary_group_title,
               u.post_count, u.reputation, u.warning_points,
               u.registration_ip_prefix, u.last_ip_prefix,
               u.last_active_at, u.created_at, u.deleted_at,
               ${BANNED_PREDICATE} as is_banned
          from users u
          join usergroups g on g.id = u.primary_group_id
         where ${sql.join(conditions, sql` and `)}
         order by u.id
         limit ${filter.limit}
      `),
    ) as Array<Record<string, unknown>>

    const mapped = rows.map(toSearchRow)
    return {
      rows: mapped,
      nextCursor:
        mapped.length < filter.limit ? null : (mapped[mapped.length - 1]?.id ?? null),
    }
  }

  async readDetail(userId: number): Promise<UserDetail | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select u.*, g.title as primary_group_title,
               ${BANNED_PREDICATE} as is_banned
          from users u
          join usergroups g on g.id = u.primary_group_id
         where u.id = ${userId}
      `),
    ) as Array<Record<string, unknown>>

    const row = rows[0]
    if (row === undefined) return null

    return {
      ...toSearchRow(row),
      displayGroupId: row.display_group_id === null ? null : Number(row.display_group_id),
      emailVerifiedAt: toDate(row.email_verified_at),
      passwordChangedAt: toDate(row.password_changed_at),
      threadCount: Number(row.thread_count),
      legacyMybbUid: row.legacy_mybb_uid === null ? null : Number(row.legacy_mybb_uid),
    }
  }

  async updateAccount(userId: number, input: UserAccountInput): Promise<void> {
    const username = input.username.trim()
    const email = input.email.trim()
    if (username === '') throw new ValidationError('A member needs a username.')
    if (email === '') throw new ValidationError('A member needs an email address.')

    // eslint-disable-next-line no-restricted-properties -- writing the persisted column, not deciding access
    const primaryGroupId = input.primaryGroupId

    await withPermissionVersionBump(this.db, async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`
          update users
             set username = ${username},
                 username_lower = ${fold(username)},
                 email = ${email},
                 email_lower = ${fold(email)},
                 primary_group_id = ${primaryGroupId},
                 display_group_id = ${input.displayGroupId},
                 updated_at = now()
           where id = ${userId}
          returning id
        `),
      ) as Array<{ id: number }>

      if (rows[0] === undefined) throw new ValidationError('No such member.')
    })
  }

  async setState(userId: number, state: AccountState): Promise<void> {
    if (state === 'banned') {
      throw new ValidationError('Bans are issued through the ban screen, not here.')
    }

    await withPermissionVersionBump(this.db, async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`
          update users set state = ${assertState(state)}, updated_at = now()
           where id = ${userId} and state <> 'banned'
          returning id
        `),
      ) as Array<{ id: number }>

      if (rows[0] === undefined) {
        throw new ValidationError('No such member, or the member is banned.')
      }
    })
  }

  async sharingIpPrefix(
    prefix: string,
    excludeUserId: number,
    limit = 50,
  ): Promise<readonly UserSearchRow[]> {
    if (prefix.trim() === '') return []

    const pattern = `${likeFragment(prefix.trim())}%`
    const rows = resultRows(
      await this.db.execute(sql`
        select u.id, u.username, u.email, u.state, u.primary_group_id,
               g.title as primary_group_title,
               u.post_count, u.reputation, u.warning_points,
               u.registration_ip_prefix, u.last_ip_prefix,
               u.last_active_at, u.created_at, u.deleted_at
          from users u
          join usergroups g on g.id = u.primary_group_id
         where u.id <> ${excludeUserId}
           and (u.registration_ip_prefix like ${pattern} escape '\\'
                or u.last_ip_prefix like ${pattern} escape '\\')
         order by u.id
         limit ${limit}
      `),
    ) as Array<Record<string, unknown>>

    return rows.map(toSearchRow)
  }

  async readSecondaryGroups(userId: number): Promise<readonly number[]> {
    const rows = resultRows(
      await this.db.execute(sql`
        select group_id from user_group_memberships
         where user_id = ${userId}
         order by group_id
      `),
    ) as Array<{ group_id: number }>

    return rows.map((row) => Number(row.group_id))
  }

  async setSecondaryGroups(
    userId: number,
    groupIds: readonly number[],
    grantedByUserId: number | null,
  ): Promise<void> {
    await withPermissionVersionBump(this.db, async (tx) => {
      const rows = resultRows(
        await tx.execute(sql`select primary_group_id from users where id = ${userId}`),
      ) as Array<Record<string, unknown>>

      if (rows[0] === undefined) throw new ValidationError('No such member.')
      const primary = Number(rows[0].primary_group_id)

      const wanted = [...new Set(groupIds)].filter((id) => id !== primary)

      await tx.execute(sql`delete from user_group_memberships where user_id = ${userId}`)
      for (const groupId of wanted) {
        await tx.execute(sql`
          insert into user_group_memberships (user_id, group_id, granted_by_user_id)
          values (${userId}, ${groupId}, ${grantedByUserId})
        `)
      }
    })
  }

  async listGroups(): Promise<readonly { readonly id: number; readonly title: string }[]> {
    const rows = resultRows(
      await this.db.execute(
        sql`select id, title from usergroups order by display_order, id`,
      ),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({ id: Number(row.id), title: String(row.title) }))
  }
}
