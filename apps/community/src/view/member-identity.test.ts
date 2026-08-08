/**
 * The two helpers every listing shares.
 *
 * Both exist because six view builders were about to write the same two null
 * checks, and a group colour applied at five of six call sites is worse than
 * one applied at none: a moderator whose name is green in a thread and grey in
 * the sidebar looks like a rendering bug, which is exactly what it would be.
 */
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

  /*
   * Three different ways of having no colour, and all three have to be `null`
   * rather than `undefined`: the field lands on a view model a theme reads, and
   * `className={undefined}` and `className={null}` are the same in React but
   * `'gname-3 undefined'` is not the same as `'gname-3'` if a theme concatenates
   * — which one of them does.
   */
  it('is null for a page that resolved nothing, a guest, and an uncoloured group', () => {
    expect(nameClassOf(undefined, 7)).toBeNull()
    expect(nameClassOf(new Map([[7, CLASSED]]), null)).toBeNull()
    expect(nameClassOf(new Map([[7, PLAIN]]), 7)).toBeNull()
    /* And for somebody the query simply did not return. */
    expect(nameClassOf(new Map([[7, CLASSED]]), 99)).toBeNull()
  })
})

describe('distinctUserIds', () => {
  /*
   * A thread listing yields two ids per row — who started it and who posted
   * last — and on a quiet community those are mostly the same handful of people.
   * Passing the raw list would ask the database about the same member twenty
   * times in one `in (...)`.
   */
  it('drops the nulls and the repeats', () => {
    expect(distinctUserIds([7, null, 7, 9, null, 9])).toEqual([7, 9])
  })

  it('is empty for a page with nobody on it', () => {
    expect(distinctUserIds([])).toEqual([])
    expect(distinctUserIds([null, null])).toEqual([])
  })
})
