import 'server-only'

import { env } from '@meith/core'
import { getDb, type MemberDirectorySort, PostgresMemberDirectoryRepository } from '@meith/db'

export const MEMBER_DIRECTORY_PAGE = 50

export function memberDirectoryRepository(): PostgresMemberDirectoryRepository | null {
  return env.DATA_SOURCE === 'postgres' ? new PostgresMemberDirectoryRepository(getDb()) : null
}

const SORTS: readonly MemberDirectorySort[] = ['name', 'posts', 'joined']

export function parseMemberDirectorySort(value: string | undefined): MemberDirectorySort {
  return SORTS.find((sort) => sort === value) ?? 'name'
}
