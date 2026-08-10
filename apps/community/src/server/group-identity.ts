import 'server-only'

import { CacheTags } from '@meith/core'
import {
  PostgresGroupIdentityRepository,
  getDb,
  type GroupIdentity,
  type MemberStanding,
} from '@meith/db'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'

import type { MemberIdentity } from '@/view/member-identity'

import { getContainer } from './container'
import { badgeSrc } from './group-badge'
import { currentColourScheme } from './theme'
import { groupNameClass, renderGroupNameStyle } from './theme-style'

export type { MemberIdentity }
export { groupNameClass }

function repository(): PostgresGroupIdentityRepository | null {
  return getContainer().dataSource === 'postgres'
    ? new PostgresGroupIdentityRepository(getDb())
    : null
}

const loadStyled = unstable_cache(
  async (): Promise<readonly GroupIdentity[]> => {
    const repo = repository()
    return repo === null ? [] : repo.styled()
  },
  ['group-identity-styles'],
  { tags: [CacheTags.groups()] },
)

export const getGroupStyle = cache(async (): Promise<string> => {
  const groups = await loadStyled().catch(() => [])
  return renderGroupNameStyle(
    groups.map((group) => ({
      groupId: group.groupId,
      light: group.nameColorLight,
      dark: group.nameColorDark,
    })),
  )
})

function resolveBadge(
  group: GroupIdentity,
  scheme: 'light' | 'dark' | 'system',
): MemberIdentity['badge'] {
  const light = group.badgeImageLight ?? group.badgeImageDark
  const dark = group.badgeImageDark ?? group.badgeImageLight
  if (light === null || dark === null) return null

  const alt = group.title
  const lightSrc = badgeSrc(group.groupId, group.badgeImageLight === null ? 'dark' : 'light', light)
  const darkSrc = badgeSrc(group.groupId, group.badgeImageDark === null ? 'light' : 'dark', dark)

  if (scheme === 'light') return { src: lightSrc, darkSrc: null, alt }
  if (scheme === 'dark') return { src: darkSrc, darkSrc: null, alt }
  return { src: lightSrc, darkSrc: darkSrc === lightSrc ? null : darkSrc, alt }
}

const load = cache(async (key: string): Promise<ReadonlyMap<number, MemberStanding>> => {
  const repo = repository()
  if (repo === null) return new Map()
  return repo.forUsers(key.split(',').map(Number)).catch(() => new Map<number, MemberStanding>())
})

export async function identitiesFor(
  userIds: readonly number[],
): Promise<ReadonlyMap<number, MemberIdentity>> {
  const ids = [...new Set(userIds)].sort((a, b) => a - b)
  if (ids.length === 0) return new Map()

  const [rows, scheme] = await Promise.all([load(ids.join(',')), currentColourScheme()])

  return new Map(
    [...rows].map(([userId, group]) => [
      userId,
      {
        groupId: group.groupId,
        title: group.title,
        nameClass:
          group.nameColorLight === null && group.nameColorDark === null
            ? null
            : groupNameClass(group.groupId),
        badge: resolveBadge(group, scheme),
        reputation: group.reputation,
      },
    ]),
  )
}
