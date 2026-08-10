import { emptyPermissionSet, type PermissionSet } from '@meith/core'
import { describe, expect, it } from 'vitest'

import { resolveForumMatrix, indexOverrides } from './resolve'
import type { ForumOverride, GroupDefaults } from './types'

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

describe('resolveForumMatrix — four-level inheritance', () => {
  const groups = groupWith({ canPostThreads: false, canView: true })
  const overrides: ForumOverride[] = [
    { forumId: L2, groupId: GROUP_ID, overrides: { canPostThreads: true } },
    { forumId: L4, groupId: GROUP_ID, overrides: { canPostThreads: false } },
  ]
  const idx = indexOverrides(overrides)

  it('L1 uses the group default (chain entirely null)', () => {
    expect(resolveForumMatrix(chainAt[L1]!, groups, idx).canPostThreads).toBe(false)
  })

  it('L2 takes its own override', () => {
    expect(resolveForumMatrix(chainAt[L2]!, groups, idx).canPostThreads).toBe(true)
  })

  it('L3 inherits the nearest ancestor override (L2), not the default', () => {
    expect(resolveForumMatrix(chainAt[L3]!, groups, idx).canPostThreads).toBe(true)
  })

  it('L4 takes its own override, shadowing the inherited L2 grant', () => {
    expect(resolveForumMatrix(chainAt[L4]!, groups, idx).canPostThreads).toBe(false)
  })
})

describe('resolveForumMatrix — order of walk vs combine', () => {
  const X = 2
  const Y = 3
  const groups: GroupDefaults[] = [
    { groupId: X, permissions: { ...emptyPermissionSet(), canView: true, canPostThreads: true } },
    { groupId: Y, permissions: { ...emptyPermissionSet(), canView: true, canPostThreads: false } },
  ]
  const overrides: ForumOverride[] = [
    { forumId: L2, groupId: X, overrides: { canPostThreads: false } },
  ]
  const idx = indexOverrides(overrides)

  it('a nearer deny for one group is not rescued by another group default', () => {
    const r = resolveForumMatrix(chainAt[L2]!, groups, idx)
    expect(r.canPostThreads).toBe(false)
  })
})
