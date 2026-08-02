/**
 * F67 — user administration: search, one member, and the writes on them.
 *
 * Three things in this file are the feature; the rest is a listing.
 *
 * **A search term is escaped before it reaches `like`.** `%` and `_` are
 * wildcards, and an operator searching for a member called `100%` would
 * otherwise match every member on the board — which on the screen that *bans
 * people* is not a cosmetic bug. Every user-supplied fragment goes through
 * `likeFragment`.
 *
 * **Search is keyset-paged, never OFFSET.** The set being paged is `users`,
 * which the pages themselves mutate — banning somebody changes their state and
 * therefore whether they still match the filter. An OFFSET page over a set that
 * is being changed skips rows silently, and the rows it skips are the ones the
 * operator just acted on.
 *
 * **Anything that changes a permission input bumps the version.** Group, state
 * and deletion all decide what F20 resolves, so they go through
 * `withPermissionVersionBump` — the same pairing F65 and F66 use, for the same
 * reason: a lost bump is a revocation that silently did not take effect.
 */
import { sql, type SQL } from 'drizzle-orm'

import { ValidationError } from '@forum/core'

import type { Database } from './client'
import { withPermissionVersionBump } from './permission-version'
import { resultRows } from './result-rows'

/** The account states F18 and F23 write. */
export type AccountState = 'active' | 'awaiting_activation' | 'banned'

const STATES: readonly AccountState[] = ['active', 'awaiting_activation', 'banned']

export interface UserSearchFilter {
  /** Matched against `username_lower`, as a contains. */
  readonly username?: string | undefined
  readonly email?: string | undefined
  /** Matched against either IP prefix, as a starts-with. */
  readonly ipPrefix?: string | undefined
  readonly primaryGroupId?: number | undefined
  readonly state?: AccountState | undefined
  readonly registeredBefore?: Date | undefined
  readonly registeredAfter?: Date | undefined
  readonly minPostCount?: number | undefined
  readonly maxPostCount?: number | undefined
  /** Include members whose account has been soft-deleted. Off by default. */
  readonly includeDeleted?: boolean | undefined
  /** Keyset cursor. Pass 0 to start. */
  readonly afterUserId: number
  readonly limit: number
}

export interface UserSearchRow {
  readonly id: number
  readonly username: string
  readonly email: string
  readonly state: AccountState
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
  /** Pass back as `afterUserId`. `null` when the last page has been reached. */
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

/**
 * Escape a user-supplied fragment for `like`.
 *
 * `%` and `_` are wildcards and `\` is the escape character, so all three have
 * to be escaped or a search for `100%` matches everybody. This is not
 * defence-in-depth against injection — the value is still a bound parameter —
 * it is about the query meaning what the operator typed.
 */
export function likeFragment(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

/** Case-folded the same way `@forum/accounts` folds identifiers. */
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

  /**
   * Find members.
   *
   * Every criterion is ANDed and every one is optional, so an empty filter is
   * "everybody" rather than "nobody" — which is what an operator opening the
   * screen expects to see.
   */
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
      /*
       * Starts-with on both columns. Only a prefix is ever stored (F19), so a
       * contains would match the middle of an address and mean nothing.
       */
      const pattern = `${likeFragment(filter.ipPrefix.trim())}%`
      conditions.push(
        sql`(u.registration_ip_prefix like ${pattern} escape '\\'
             or u.last_ip_prefix like ${pattern} escape '\\')`,
      )
    }
    /*
     * F20: a group id used as a *search criterion* is the operator's question,
     * not an access decision — nothing here concludes anything from the value.
     */
    // eslint-disable-next-line no-restricted-properties -- F20: filtering on a column, not deciding access
    if (filter.primaryGroupId !== undefined) {
      // eslint-disable-next-line no-restricted-properties -- F20: filtering on a column, not deciding access
      conditions.push(sql`u.primary_group_id = ${filter.primaryGroupId}`)
    }
    if (filter.state !== undefined) {
      conditions.push(sql`u.state = ${assertState(filter.state)}`)
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
      /*
       * Excluded by default. A soft-deleted account is one somebody already
       * decided about, and listing them among live members invites acting on
       * them twice.
       */
      conditions.push(sql`u.deleted_at is null`)
    }

    const rows = resultRows(
      await this.db.execute(sql`
        select u.id, u.username, u.email, u.state, u.primary_group_id,
               g.title as primary_group_title,
               u.post_count, u.reputation, u.warning_points,
               u.registration_ip_prefix, u.last_ip_prefix,
               u.last_active_at, u.created_at, u.deleted_at
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
      /* A short page means the end, so the caller stops without a second query. */
      nextCursor:
        mapped.length < filter.limit ? null : (mapped[mapped.length - 1]?.id ?? null),
    }
  }

  async readDetail(userId: number): Promise<UserDetail | null> {
    const rows = resultRows(
      await this.db.execute(sql`
        select u.*, g.title as primary_group_title
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

  /**
   * Edit the account itself.
   *
   * The folded columns are written from the same values in the same statement.
   * `username_lower` and `email_lower` are what every lookup and both unique
   * indexes use, so a rename that updated only the display column would produce
   * an account that cannot log in and a name that can be registered twice.
   */
  async updateAccount(userId: number, input: UserAccountInput): Promise<void> {
    const username = input.username.trim()
    const email = input.email.trim()
    if (username === '') throw new ValidationError('A member needs a username.')
    if (email === '') throw new ValidationError('A member needs an email address.')

    /* F20: read out here so the SQL below carries a value, not a decision. */
    // eslint-disable-next-line no-restricted-properties -- F20: writing the persisted column, not deciding access
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

  /**
   * Move a member between states.
   *
   * Refuses to write `banned` here. F23 owns that transition: banning captures
   * the group the member was in, which is the entire mechanism behind
   * "an expired ban restores the prior group". A state write that set `banned`
   * directly would produce a member nothing can un-ban correctly — the column
   * would say banned and no ban row would exist to expire.
   */
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

  /**
   * Everyone who has been seen on an IP prefix, other than one member.
   *
   * Only a prefix is stored (F19: the last octet is dropped at write time), so
   * this answers "same network" and not "same machine" — which is what the
   * screen has to say, because a shared prefix is a household or an office as
   * often as it is one person with two accounts.
   */
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

  /** Groups, for the pickers. Ordered as the group screen orders them. */
  async listGroups(): Promise<readonly { readonly id: number; readonly title: string }[]> {
    const rows = resultRows(
      await this.db.execute(
        sql`select id, title from usergroups order by display_order, id`,
      ),
    ) as Array<Record<string, unknown>>

    return rows.map((row) => ({ id: Number(row.id), title: String(row.title) }))
  }
}
