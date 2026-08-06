import { describe, expect, it } from 'vitest'

import { editableFields, maxLengthFor, resolveAccess, visibleFields } from './resolve'
import type { ProfileFieldDefinition, ProfileFieldGroupRule } from './types'

function field(overrides: Partial<ProfileFieldDefinition> = {}): ProfileFieldDefinition {
  return {
    id: 1,
    key: 'pronouns',
    label: 'Pronouns',
    description: null,
    type: 'text',
    options: [],
    maxLength: null,
    displayOrder: 0,
    isActive: true,
    requiredAtRegistration: false,
    defaultVisible: true,
    defaultEditable: true,
    showInPostbit: false,
    ...overrides,
  }
}

function rule(overrides: Partial<ProfileFieldGroupRule> = {}): ProfileFieldGroupRule {
  return { fieldId: 1, groupId: 2, canView: null, canEdit: null, ...overrides }
}

describe('resolveAccess', () => {
  it('falls back to the field defaults when no rule applies', () => {
    const access = resolveAccess(field({ defaultVisible: false, defaultEditable: true }), [])
    expect(access).toEqual({ canView: false, canEdit: true })
  })

  it('ignores rules belonging to another field', () => {
    const access = resolveAccess(field({ id: 1, defaultVisible: false }), [
      rule({ fieldId: 2, canView: true }),
    ])
    expect(access.canView).toBe(false)
  })

  it('treats NULL as no opinion, not as a denial', () => {
    const access = resolveAccess(field({ defaultVisible: true }), [rule({ canView: null })])
    expect(access.canView).toBe(true)
  })

  it('lets one explicit false override a permissive default', () => {
    const access = resolveAccess(field({ defaultVisible: true }), [rule({ canView: false })])
    expect(access.canView).toBe(false)
  })

  it('grants when any applicable group grants, even if another denies (R4.2)', () => {
    const access = resolveAccess(field({ defaultVisible: false }), [
      rule({ groupId: 2, canView: false }),
      rule({ groupId: 7, canView: true }),
    ])
    expect(access.canView).toBe(true)
  })

  it('answers viewing and editing independently', () => {
    const access = resolveAccess(field({ defaultVisible: true, defaultEditable: true }), [
      rule({ canView: true, canEdit: false }),
    ])
    expect(access).toEqual({ canView: true, canEdit: false })
  })
})

describe('visibleFields', () => {
  const values = new Map([[1, 'they/them']])

  it('drops an inactive field even when it has a value the viewer may see', () => {
    expect(visibleFields({ fields: [field({ isActive: false })], applicable: [], values })).toEqual(
      [],
    )
  })

  it('drops a field the viewer may not see', () => {
    expect(
      visibleFields({ fields: [field({ defaultVisible: false })], applicable: [], values }),
    ).toEqual([])
  })

  it('drops a field with no answer rather than rendering it empty', () => {
    expect(visibleFields({ fields: [field()], applicable: [], values: new Map() })).toEqual([])
  })

  it('keeps a visible, answered field with its value', () => {
    const [first] = visibleFields({ fields: [field()], applicable: [], values })
    expect(first?.value).toBe('they/them')
    expect(first?.field.key).toBe('pronouns')
  })
})

describe('editableFields', () => {
  it('keeps an unanswered field, which is the one a member came to fill in', () => {
    const resolved = editableFields({ fields: [field()], applicable: [], values: new Map() })
    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.value).toBe('')
  })

  it('keeps a field a member may write but not read back', () => {
    const resolved = editableFields({
      fields: [field({ defaultVisible: false, defaultEditable: true })],
      applicable: [],
      values: new Map(),
    })
    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.canView).toBe(false)
  })

  it('drops a field the member may not edit', () => {
    expect(
      editableFields({
        fields: [field({ defaultEditable: false })],
        applicable: [],
        values: new Map(),
      }),
    ).toEqual([])
  })

  it('drops an inactive field', () => {
    expect(
      editableFields({ fields: [field({ isActive: false })], applicable: [], values: new Map() }),
    ).toEqual([])
  })
})

describe('maxLengthFor', () => {
  it("uses the field's own limit when it has one", () => {
    expect(maxLengthFor(field({ maxLength: 30 }))).toBe(30)
  })

  it("falls back to the type's default", () => {
    expect(maxLengthFor(field({ type: 'textarea', maxLength: null }))).toBe(2000)
    expect(maxLengthFor(field({ type: 'text', maxLength: null }))).toBe(200)
  })

  it('treats an unknown type as text, so a field from a newer deploy still has a limit', () => {
    expect(maxLengthFor(field({ type: null, maxLength: null }))).toBe(200)
  })

  it('ignores a nonsensical stored limit rather than refusing every value', () => {
    expect(maxLengthFor(field({ type: 'text', maxLength: 0 }))).toBe(200)
  })
})
