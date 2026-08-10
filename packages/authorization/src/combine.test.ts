import { emptyPermissionSet } from '@meith/core'
import { describe, expect, it } from 'vitest'

import { combineGroupValue, combinePermissionSets } from './combine'

describe('combineGroupValue', () => {
  describe('boolean (OR, most-permissive wins)', () => {
    it('grants if any group grants', () => {
      expect(combineGroupValue('boolean', [false, true, false])).toBe(true)
    })
    it('denies only if every group denies', () => {
      expect(combineGroupValue('boolean', [false, false])).toBe(false)
    })
  })

  describe('numeric (MAX, but 0 = unlimited beats everything)', () => {
    it('takes the maximum of finite values', () => {
      expect(combineGroupValue('numeric', [10, 50, 25])).toBe(50)
    })
    it('lets 0 (unlimited) beat any finite value', () => {
      expect(combineGroupValue('numeric', [50, 0])).toBe(0)
      expect(combineGroupValue('numeric', [0, 999])).toBe(0)
    })
  })

  describe('negative (AND, any exemption frees the user)', () => {
    it('stays restricted only when every group restricts', () => {
      expect(combineGroupValue('negative', [true, true])).toBe(true)
    })
    it('is exempted the moment one group exempts', () => {
      expect(combineGroupValue('negative', [true, false, true])).toBe(false)
    })
  })
})

describe('combinePermissionSets — a user in three groups', () => {
  it('resolves each field by its own rule simultaneously', () => {
    const base = emptyPermissionSet()

    const a = {
      ...base,
      canPostThreads: true,
      maxPostsPerDay: 50,
      requiresPostApproval: true,
    }
    const b = {
      ...base,
      canPostThreads: false,
      maxPostsPerDay: 0,
      requiresPostApproval: true,
    }
    const c = {
      ...base,
      canPostThreads: false,
      maxPostsPerDay: 10,
      requiresPostApproval: false,
    }

    const r = combinePermissionSets([a, b, c])

    expect(r.canPostThreads).toBe(true)
    expect(r.maxPostsPerDay).toBe(0)
    expect(r.requiresPostApproval).toBe(false)
  })

  it('an empty group list is maximally restricted, not undefined', () => {
    const r = combinePermissionSets([])
    expect(r.canPostThreads).toBe(false)
    expect(r.requiresPostApproval).toBe(true)
    expect(r.maxPostsPerDay).toBe(0)
  })

  it('a single group passes through unchanged (fast path)', () => {
    const only = { ...emptyPermissionSet(), canView: true, maxPostsPerDay: 7 }
    const r = combinePermissionSets([only])
    expect(r).toEqual(only)
    expect(r).not.toBe(only)
  })
})
