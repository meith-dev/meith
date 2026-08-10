import {
  FORUM_PERMISSION_FIELDS,
  type ForumPermissions,
  type PermissionSet,
} from '@meith/core'

import { combineGroupValue } from './combine'
import type { ForumOverride, GroupDefaults } from './types'

export function resolveForumMatrix(
  chain: readonly number[],
  groups: readonly GroupDefaults[],
  overridesByForumGroup: ReadonlyMap<string, ForumOverride>,
): ForumPermissions {
  const out: Record<string, boolean | number> = {}

  for (const field of FORUM_PERMISSION_FIELDS) {
    const key = field.key

    const perGroup: (boolean | number)[] = groups.map((group) => {
      for (const forumId of chain) {
        const override = overridesByForumGroup.get(`${forumId}:${group.groupId}`)
        const value = override?.overrides[key as keyof ForumPermissions]
        if (value !== undefined && value !== null) {
          return value as boolean | number
        }
      }
      return (group.permissions as Record<string, boolean | number>)[key]!
    })

    out[key] = combineGroupValue(field.kind, perGroup)
  }

  return out as ForumPermissions
}

export function indexOverrides(
  overrides: readonly ForumOverride[],
): Map<string, ForumOverride> {
  const map = new Map<string, ForumOverride>()
  for (const o of overrides) map.set(`${o.forumId}:${o.groupId}`, o)
  return map
}

export function forumSubset(set: PermissionSet): ForumPermissions {
  const out: Record<string, boolean | number> = {}
  for (const field of FORUM_PERMISSION_FIELDS) {
    out[field.key] = (set as Record<string, boolean | number>)[field.key]!
  }
  return out as ForumPermissions
}
