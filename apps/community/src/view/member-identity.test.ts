import { describe, expect, it } from 'vitest'

import { distinctUserIds, nameClassOf, type MemberIdentity } from './member-identity'

const CLASSED: MemberIdentity = {
  groupId: 3,
  title: 'Moderator',
  nameClass: 'gname-3',
  badge: null,
  reputation: 0,
}

const PLAIN: MemberIdentity = { ...CLASSED, groupId: 5, title: 'Members', nameClass: null }

describe('nameClassOf', () => {
  it('finds the class for a member whose group has one', () => {
    expect(nameClassOf(new Map([[7, CLASSED]]), 7)).toBe('gname-3')
  })

  it('is null for a page that resolved nothing, a guest, and an uncoloured group', () => {
    expect(nameClassOf(undefined, 7)).toBeNull()
    expect(nameClassOf(new Map([[7, CLASSED]]), null)).toBeNull()
    expect(nameClassOf(new Map([[7, PLAIN]]), 7)).toBeNull()
    expect(nameClassOf(new Map([[7, CLASSED]]), 99)).toBeNull()
  })
})

describe('distinctUserIds', () => {
  it('drops the nulls and the repeats', () => {
    expect(distinctUserIds([7, null, 7, 9, null, 9])).toEqual([7, 9])
  })

  it('is empty for a page with nobody on it', () => {
    expect(distinctUserIds([])).toEqual([])
    expect(distinctUserIds([null, null])).toEqual([])
  })
})
