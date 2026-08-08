/**
 * F21 acceptance — community permission inheritance (R4.1 layer 2, R4.2).
 *
 * The headline case: a four-level tree with overrides at levels 2 and 4,
 * resolving correctly at every level. This is the case that distinguishes
 * "walk per group, then combine" (correct) from "combine, then walk" (wrong).
 */
import { emptyPermissionSet, type PermissionSet } from '@meith/core'
import { describe, expect, it } from 'vitest'

import { resolveCommunityMatrix, indexOverrides } from './resolve'
import type { CommunityOverride, GroupDefaults } from './types'

// Four-level tree: L1 (root) -> L2 -> L3 -> L4. Chains are nearest-first.
const L1 = 1
const L2 = 2
const L3 = 3
const L4 = 4
const chainAt: Record<number, number[]> = {
  [L1]: [L1],
  [L2]: [L2, L1],
  [L3]: [L3, L2, L1],
  [L4]: [L4, L3, L2, L1],
}

const GROUP_ID = 2

function groupWith(overrides: Partial<PermissionSet>): GroupDefaults[] {
  return [{ groupId: GROUP_ID, permissions: { ...emptyPermissionSet(), ...overrides } }]
}

describe('resolveCommunityMatrix — four-level inheritance', () => {
  // Group default: cannot post. Override grants posting at L2; a deeper
  // override revokes it again at L4. L3 inherits L2's grant; L1 keeps the
  // default.
  const groups = groupWith({ canPostThreads: false, canView: true })
  const overrides: CommunityOverride[] = [
    { communityId: L2, groupId: GROUP_ID, overrides: { canPostThreads: true } },
    { communityId: L4, groupId: GROUP_ID, overrides: { canPostThreads: false } },
  ]
  const idx = indexOverrides(overrides)

  it('L1 uses the group default (chain entirely null)', () => {
    expect(resolveCommunityMatrix(chainAt[L1]!, groups, idx).canPostThreads).toBe(false)
  })

  it('L2 takes its own override', () => {
    expect(resolveCommunityMatrix(chainAt[L2]!, groups, idx).canPostThreads).toBe(true)
  })

  it('L3 inherits the nearest ancestor override (L2), not the default', () => {
    expect(resolveCommunityMatrix(chainAt[L3]!, groups, idx).canPostThreads).toBe(true)
  })

  it('L4 takes its own override, shadowing the inherited L2 grant', () => {
    expect(resolveCommunityMatrix(chainAt[L4]!, groups, idx).canPostThreads).toBe(false)
  })
})

describe('resolveCommunityMatrix — order of walk vs combine', () => {
  // Two groups. Group X is denied at the leaf but granted at the root; group Y
  // is granted at the leaf. Correct: resolve each group down its chain first
  // (X->deny at leaf, Y->grant at leaf), THEN OR => granted. The wrong order
  // (OR the raw overrides first) would also grant here, so we make it decisive:
  // give X a NEARER deny that must win for X, while Y is absent (default deny).
  const X = 2
  const Y = 3
  const groups: GroupDefaults[] = [
    { groupId: X, permissions: { ...emptyPermissionSet(), canView: true, canPostThreads: true } },
    { groupId: Y, permissions: { ...emptyPermissionSet(), canView: true, canPostThreads: false } },
  ]
  // Leaf overrides posting off for X only; Y inherits its (false) default.
  const overrides: CommunityOverride[] = [
    { communityId: L2, groupId: X, overrides: { canPostThreads: false } },
  ]
  const idx = indexOverrides(overrides)

  it('a nearer deny for one group is not rescued by another group default', () => {
    // X: leaf override false. Y: default false. OR(false,false) = false.
    // If the code combined group *defaults* first (true OR false = true) and
    // then walked, X's leaf deny would be lost and this would wrongly be true.
    const r = resolveCommunityMatrix(chainAt[L2]!, groups, idx)
    expect(r.canPostThreads).toBe(false)
  })
})
