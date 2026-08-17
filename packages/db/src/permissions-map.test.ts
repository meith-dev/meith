import { describe, expect, it } from 'vitest'

import { emptyPermissionSet, FORUM_PERMISSION_FIELDS, PERMISSION_FIELDS } from '@meith/core'

import { forumRowToOverride, groupRowToPermissionSet } from './permissions-map'

describe('groupRowToPermissionSet', () => {
  it('produces a complete set even from an empty row (registry defaults)', () => {
    const result = groupRowToPermissionSet({})
    expect(result).toEqual(emptyPermissionSet())
    for (const field of PERMISSION_FIELDS) {
      expect(result[field.key as keyof typeof result]).toBeDefined()
    }
  })

  it('reads declared values over the defaults', () => {
    const result = groupRowToPermissionSet({ canView: true, isAdministrator: true })
    expect(result.canView).toBe(true)
    expect(result.isAdministrator).toBe(true)
  })

  it('coerces numeric columns arriving as strings', () => {
    const numericField = PERMISSION_FIELDS.find((f) => f.kind === 'numeric')
    if (!numericField) throw new Error('expected a numeric field in the registry')

    const result = groupRowToPermissionSet({ [numericField.key]: '7' })
    expect(result[numericField.key as keyof typeof result]).toBe(7)
    expect(typeof result[numericField.key as keyof typeof result]).toBe('number')
  })

  it('coerces postgres boolean encodings (t/f, 1/0)', () => {
    expect(groupRowToPermissionSet({ canView: 't' }).canView).toBe(true)
    expect(groupRowToPermissionSet({ canView: 'f' }).canView).toBe(false)
    expect(groupRowToPermissionSet({ canView: 1 }).canView).toBe(true)
    expect(groupRowToPermissionSet({ canView: 0 }).canView).toBe(false)
  })

  it('throws on a non-numeric value in a numeric column (corruption, not 0)', () => {
    const numericField = PERMISSION_FIELDS.find((f) => f.kind === 'numeric')!
    expect(() => groupRowToPermissionSet({ [numericField.key]: 'lots' })).toThrow(
      /expected a number/,
    )
  })
})

describe('forumRowToOverride', () => {
  it('keeps only non-null forum-scoped keys (null means inherit)', () => {
    const forumField = FORUM_PERMISSION_FIELDS[0]!
    const row: Record<string, unknown> = {}
    for (const f of FORUM_PERMISSION_FIELDS) row[f.key] = null
    row[forumField.key] = forumField.kind === 'numeric' ? 3 : true

    const override = forumRowToOverride(row)
    expect(Object.keys(override)).toEqual([forumField.key])
  })

  it('never includes global-only fields even if present on the row', () => {
    const globalOnly = PERMISSION_FIELDS.find((f) => f.scope === 'global')
    if (!globalOnly) return
    const override = forumRowToOverride({ [globalOnly.key]: true })
    expect(globalOnly.key in override).toBe(false)
  })

  it('returns an empty object when every column is null (pure inherit)', () => {
    const row: Record<string, unknown> = {}
    for (const f of FORUM_PERMISSION_FIELDS) row[f.key] = null
    expect(forumRowToOverride(row)).toEqual({})
  })
})
