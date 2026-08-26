import { describe, expect, it } from 'vitest'

import { mayAdd, mayDelete, resolveCalendarConfig } from './access'

const ROSTER_ONLY = resolveCalendarConfig({})
const OPEN = resolveCalendarConfig({ any_member_may_add: true })

describe('who may add an event', () => {
  it('refuses a guest, whichever way the board is configured', () => {
    expect(mayAdd({ userId: null, config: ROSTER_ONLY, organisers: [] })).toBe('guest')
    expect(mayAdd({ userId: null, config: OPEN, organisers: [] })).toBe('guest')
  })

  it('allows an organiser and refuses a member who is not one', () => {
    expect(mayAdd({ userId: 7, config: ROSTER_ONLY, organisers: [7, 9] })).toBe('allowed')
    expect(mayAdd({ userId: 8, config: ROSTER_ONLY, organisers: [7, 9] })).toBe('not-an-organiser')
  })

  it('allows any member once the board opens it up', () => {
    expect(mayAdd({ userId: 8, config: OPEN, organisers: [] })).toBe('allowed')
  })

  it('defaults to the roster, so a fresh install is not open to everyone', () => {
    expect(ROSTER_ONLY.anyMemberMayAdd).toBe(false)
    expect(mayAdd({ userId: 8, config: ROSTER_ONLY, organisers: [] })).toBe('not-an-organiser')
  })

  it('says which refusal it is, so the page can explain itself', () => {
    expect(mayAdd({ userId: null, config: ROSTER_ONLY, organisers: [] })).not.toBe(
      mayAdd({ userId: 8, config: ROSTER_ONLY, organisers: [] }),
    )
  })
})

describe('who may remove an event', () => {
  it('lets the member who added it remove it', () => {
    expect(mayDelete({ userId: 7, createdByUserId: 7, config: ROSTER_ONLY, organisers: [] })).toBe(
      true,
    )
  })

  it('lets an organiser remove somebody else’s', () => {
    expect(mayDelete({ userId: 9, createdByUserId: 7, config: ROSTER_ONLY, organisers: [9] })).toBe(
      true,
    )
  })

  it('refuses an unrelated member, even where any member may add', () => {
    expect(mayDelete({ userId: 8, createdByUserId: 7, config: OPEN, organisers: [] })).toBe(false)
  })

  it('refuses a guest', () => {
    expect(mayDelete({ userId: null, createdByUserId: null, config: OPEN, organisers: [] })).toBe(
      false,
    )
  })

  it('does not let a guest-created event be removed by any signed-in member', () => {
    expect(
      mayDelete({ userId: 8, createdByUserId: null, config: ROSTER_ONLY, organisers: [] }),
    ).toBe(false)
  })
})
