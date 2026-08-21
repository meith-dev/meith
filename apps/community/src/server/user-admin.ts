import { msg } from '@meith/i18n'
import 'server-only'

import type { BanRecord } from '@meith/accounts'
import { BanService } from '@meith/accounts'
import { ForbiddenError, optional } from '@meith/core'
import {
  type AccountState,
  getDb,
  PostgresBanRepository,
  PostgresUserAdminRepository,
  PostgresUserBulkRepository,
  PostgresUserMergeRepository,
  type PruneCriteria,
  type UserDetail,
  type UserSearchFilter,
  type UserSearchRow,
} from '@meith/db'
import { SEED_GROUP } from '@meith/runtime'

import { offsetOf, readPage } from '@/view/pager'

import { getContainer } from './container'

export const USER_PAGE = 50

export function userAdminRepository(): PostgresUserAdminRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresUserAdminRepository(getDb()) : null
}

export function requireUserAdmin(): PostgresUserAdminRepository {
  const repository = userAdminRepository()
  if (repository === null) {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-2'))
  }
  return repository
}

export function banService(): BanService {
  if (getContainer().dataSource !== 'postgres') {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-3'))
  }
  return new BanService({
    bans: new PostgresBanRepository(getDb()),
    bannedGroupId: SEED_GROUP.banned,
  })
}

export function requireUserMerge(): PostgresUserMergeRepository {
  if (getContainer().dataSource !== 'postgres') {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-4'))
  }
  return new PostgresUserMergeRepository(getDb())
}

export function banRepository(): PostgresBanRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresBanRepository(getDb()) : null
}

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
    state === 'active' || state === 'awaiting_activation' || state === 'banned' ? state : undefined

  return {
    ...optional(one('username'), (username) => ({ username })),
    ...optional(one('email'), (email) => ({ email })),
    ...optional(one('ip'), (ipPrefix) => ({ ipPrefix })),
    ...optional(number('group'), (primaryGroupId) => ({ primaryGroupId })),
    ...optional(stateFilter, (state) => ({ state })),
    ...optional(date('after'), (registeredAfter) => ({ registeredAfter })),
    ...optional(date('before'), (registeredBefore) => ({ registeredBefore })),
    ...optional(number('minPosts'), (minPostCount) => ({ minPostCount })),
    ...optional(number('maxPosts'), (maxPostCount) => ({ maxPostCount })),
    ...optional(one('deleted'), () => ({ includeDeleted: true })),
    offset: offsetOf(readPage(params), USER_PAGE),
    limit: USER_PAGE,
  }
}

export interface MemberView {
  readonly member: UserDetail
  readonly secondaryGroupIds: readonly number[]
  readonly groups: readonly { readonly id: number; readonly title: string }[]
  readonly activeBan: BanRecord | null
  readonly sharedNetwork: readonly UserSearchRow[]
}

export async function buildMemberView(userId: number): Promise<MemberView | null> {
  const repository = userAdminRepository()
  const bans = banRepository()
  if (repository === null || bans === null) return null

  const member = await repository.readDetail(userId)
  if (member === null) return null

  const prefix = member.lastIpPrefix ?? member.registrationIpPrefix ?? ''

  return {
    member,
    secondaryGroupIds: await repository.readSecondaryGroups(userId),
    groups: await repository.listGroups(),
    activeBan: await bans.findActive(userId),
    sharedNetwork: await repository.sharingIpPrefix(prefix, userId),
  }
}

export function requireUserBulk(): PostgresUserBulkRepository {
  if (getContainer().dataSource !== 'postgres') {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-5'))
  }
  return new PostgresUserBulkRepository(getDb())
}

export function userBulkRepository(): PostgresUserBulkRepository | null {
  return getContainer().dataSource === 'postgres' ? new PostgresUserBulkRepository(getDb()) : null
}

export function parsePruneCriteria(
  params: Record<string, string | string[] | undefined>,
): PruneCriteria | null {
  const one = (key: string): string | undefined => {
    const value = params[key]
    const text = Array.isArray(value) ? value[0] : value
    return text === undefined || text.trim() === '' ? undefined : text.trim()
  }

  const date = (key: string): Date | undefined => {
    const raw = one(key)
    if (raw === undefined) return undefined
    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }

  const registeredBefore = date('before')
  if (registeredBefore === undefined) return null

  return {
    registeredBefore,
    ...optional(date('inactive'), (inactiveSince) => ({ inactiveSince })),
    ...optional(one('awaiting'), () => ({ onlyAwaitingActivation: true })),
  }
}
