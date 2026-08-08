/**
 * Community permission resolution (R4.1 layer 2, R4.2 inheritance rule).
 *
 * The order of the two operations matters and is easy to get wrong:
 *
 *   1. PER GROUP, walk the ancestor chain and take the first non-null override
 *      for each field; if the whole chain is null, use that group's global
 *      default.
 *   2. THEN combine the per-group resolved values across groups by kind.
 *
 * Doing it the other way round — combining groups first, then walking — gives
 * different (wrong) answers whenever two groups have overrides at different
 * depths, because a nearer override for a weak group would lose to a farther
 * override for a strong group. F21's acceptance test ("four-level tree with
 * overrides at levels 2 and 4 resolves correctly at every level") is precisely
 * the case that distinguishes the two orders.
 *
 * Pure: takes already-loaded data, returns a matrix. All I/O lives in the
 * Authorizer, which calls the AuthorizationSource port and hands the results
 * here.
 */
import {
  COMMUNITY_PERMISSION_FIELDS,
  type CommunityPermissions,
  type PermissionSet,
} from '@meith/core'

import { combineGroupValue } from './combine'
import type { CommunityOverride, GroupDefaults } from './types'

/**
 * Resolve the community matrix for one community.
 *
 * @param chain        Community IDs from the target community up to the root, nearest
 *                     first, inclusive. `[communityId, parentId, ..., rootId]`.
 * @param groups       The actor's group defaults (global layer).
 * @param overridesByCommunityGroup  Lookup `"communityId:groupId" -> CommunityOverride`.
 */
export function resolveCommunityMatrix(
  chain: readonly number[],
  groups: readonly GroupDefaults[],
  overridesByCommunityGroup: ReadonlyMap<string, CommunityOverride>,
): CommunityPermissions {
  const out: Record<string, boolean | number> = {}

  for (const field of COMMUNITY_PERMISSION_FIELDS) {
    const key = field.key

    // Step 1: resolve this field for each group independently.
    const perGroup: (boolean | number)[] = groups.map((group) => {
      for (const communityId of chain) {
        const override = overridesByCommunityGroup.get(`${communityId}:${group.groupId}`)
        const value = override?.overrides[key as keyof CommunityPermissions]
        // Only a present, non-null override stops the walk; null means inherit.
        if (value !== undefined && value !== null) {
          return value as boolean | number
        }
      }
      // Whole chain inherited: fall back to this group's global default.
      return (group.permissions as Record<string, boolean | number>)[key]!
    })

    // Step 2: combine across groups by kind.
    out[key] = combineGroupValue(field.kind, perGroup)
  }

  return out as CommunityPermissions
}

/** Build the `"communityId:groupId"` lookup the resolver expects. */
export function indexOverrides(
  overrides: readonly CommunityOverride[],
): Map<string, CommunityOverride> {
  const map = new Map<string, CommunityOverride>()
  for (const o of overrides) map.set(`${o.communityId}:${o.groupId}`, o)
  return map
}

/** Extract the community-scoped subset of a global set (used as an inherit fallback). */
export function communitySubset(set: PermissionSet): CommunityPermissions {
  const out: Record<string, boolean | number> = {}
  for (const field of COMMUNITY_PERMISSION_FIELDS) {
    out[field.key] = (set as Record<string, boolean | number>)[field.key]!
  }
  return out as CommunityPermissions
}
