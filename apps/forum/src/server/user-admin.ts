import 'server-only'

/**
 * F67 at the app layer.
 *
 * Assembles the two screens' data and constructs the one service the writes
 * need. The ban path deliberately goes through `BanService` rather than through
 * a state column: F23 captures the group the member held at ban time, which is
 * the whole mechanism behind "an expired ban restores the prior group", and a
 * second place that knew how to ban would be a second place to get that wrong.
 * F54 named the absence of this screen rather than half-building one for
 * exactly that reason.
 */
import { BanService } from '@forum/accounts'
import { ForbiddenError } from '@forum/core'
import type { BanRecord } from '@forum/accounts'
import { SEED_GROUP } from '@forum/runtime'
import {
  PostgresBanRepository,
  PostgresUserAdminRepository,
  PostgresUserMergeRepository,
  getDb,
  type AccountState,
  type UserDetail,
  type UserSearchFilter,
  type UserSearchRow,
} from '@forum/db'

import { getContainer } from './container'

/** How many members one page of the search shows. */
export const USER_PAGE = 50

export function userAdminRepository(): PostgresUserAdminRepository | null {
  /* Gated on the data source, like F65's and F66's repositories. */
  return getContainer().dataSource === 'postgres'
    ? new PostgresUserAdminRepository(getDb())
    : null
}

export function requireUserAdmin(): PostgresUserAdminRepository {
  const repository = userAdminRepository()
  if (repository === null) {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so its members cannot be edited.',
    )
  }
  return repository
}

export function banService(): BanService {
  if (getContainer().dataSource !== 'postgres') {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so it cannot issue bans.',
    )
  }
  return new BanService({
    bans: new PostgresBanRepository(getDb()),
    bannedGroupId: SEED_GROUP.banned,
  })
}

export function requireUserMerge(): PostgresUserMergeRepository {
  if (getContainer().dataSource !== 'postgres') {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so its accounts cannot be merged.',
    )
  }
  return new PostgresUserMergeRepository(getDb())
}

export function banRepository(): PostgresBanRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresBanRepository(getDb())
    : null
}

/**
 * Read a search filter out of a URL's query string.
 *
 * The search form is a **GET form**, so the filter is in the address bar: it
 * survives a reload, it can be pasted to another administrator, and it needs no
 * JavaScript and no Server Action to work at all. A POST search would be none
 * of those things.
 *
 * Anything unparseable is dropped rather than refused. A filter is a question,
 * and answering a slightly wrong question with the members it does match is
 * more use than an error page.
 */
export function parseUserFilter(
  params: Record<string, string | string[] | undefined>,
): UserSearchFilter {
  const one = (key: string): string | undefined => {
    const value = params[key]
    const text = Array.isArray(value) ? value[0] : value
    return text === undefined || text.trim() === '' ? undefined : text.trim()
  }

  const number = (key: string): number | undefined => {
    const raw = one(key)
    if (raw === undefined) return undefined
    const parsed = Number(raw)
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
  }

  const date = (key: string): Date | undefined => {
    const raw = one(key)
    if (raw === undefined) return undefined
    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }

  const state = one('state')
  const stateFilter: AccountState | undefined =
    state === 'active' || state === 'awaiting_activation' || state === 'banned'
      ? state
      : undefined

  return {
    ...(one('username') === undefined ? {} : { username: one('username') }),
    ...(one('email') === undefined ? {} : { email: one('email') }),
    ...(one('ip') === undefined ? {} : { ipPrefix: one('ip') }),
    ...(number('group') === undefined ? {} : { primaryGroupId: number('group') }),
    ...(stateFilter === undefined ? {} : { state: stateFilter }),
    ...(date('after') === undefined ? {} : { registeredAfter: date('after') }),
    ...(date('before') === undefined ? {} : { registeredBefore: date('before') }),
    ...(number('minPosts') === undefined ? {} : { minPostCount: number('minPosts') }),
    ...(number('maxPosts') === undefined ? {} : { maxPostCount: number('maxPosts') }),
    ...(one('deleted') === undefined ? {} : { includeDeleted: true }),
    afterUserId: number('after_id') ?? 0,
    limit: USER_PAGE,
  }
}

/** The query string for the next page, preserving every other filter. */
export function nextPageQuery(
  params: Record<string, string | string[] | undefined>,
  cursor: number,
): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key === 'after_id') continue
    const text = Array.isArray(value) ? value[0] : value
    if (text !== undefined && text !== '') query.set(key, text)
  }
  query.set('after_id', String(cursor))
  return `?${query.toString()}`
}

export interface MemberView {
  readonly member: UserDetail
  /** The groups the member holds *in addition* to their primary one. */
  readonly secondaryGroupIds: readonly number[]
  readonly groups: readonly { readonly id: number; readonly title: string }[]
  readonly activeBan: BanRecord | null
  /** Other accounts seen on the same network. Empty when no prefix is stored. */
  readonly sharedNetwork: readonly UserSearchRow[]
}

export async function buildMemberView(userId: number): Promise<MemberView | null> {
  const repository = userAdminRepository()
  const bans = banRepository()
  if (repository === null || bans === null) return null

  const member = await repository.readDetail(userId)
  if (member === null) return null

  /*
   * The last-seen prefix in preference to the registration one: it answers
   * "where is this account being used from now", which is the question an
   * operator looking at a suspected second account is actually asking.
   */
  const prefix = member.lastIpPrefix ?? member.registrationIpPrefix ?? ''

  return {
    member,
    secondaryGroupIds: await repository.readSecondaryGroups(userId),
    groups: await repository.listGroups(),
    activeBan: await bans.findActive(userId),
    sharedNetwork: await repository.sharingIpPrefix(prefix, userId),
  }
}
