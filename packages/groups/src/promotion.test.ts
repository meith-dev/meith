import { describe, expect, it } from 'vitest'

import {
  evaluatePromotions,
  type PromotionCandidate,
  type PromotionGuards,
  type PromotionRule,
} from './promotion'

const GUESTS = 1
const REGISTERED = 2
const ADMINS = 3
const VETERAN = 10
const BANNED = 7
const AWAITING = 6

const NOW = new Date('2026-07-30T12:00:00Z')

const GUARDS: PromotionGuards = {
  protectedGroupIds: [BANNED, ADMINS],
  rank: new Map([
    [GUESTS, 0],
    [AWAITING, 1],
    [REGISTERED, 2],
    [VETERAN, 3],
    [ADMINS, 9],
  ]),
}

function rule(over: Partial<PromotionRule> = {}): PromotionRule {
  return {
    id: 1,
    title: 'Veteran',
    enabled: true,
    displayOrder: 0,
    minPostCount: 100,
    fromPrimaryGroupId: REGISTERED,
    toPrimaryGroupId: VETERAN,
    ...over,
  }
}

function user(over: Partial<PromotionCandidate> = {}): PromotionCandidate {
  return {
    userId: 500,
    postCount: 0,
    reputation: 0,
    registeredAt: new Date('2020-01-01T00:00:00Z'),
    primaryGroupId: REGISTERED,
    ...over,
  }
}

describe('criteria', () => {
  it('promotes a user who meets the post threshold', () => {
    const out = evaluatePromotions([rule()], [user({ postCount: 100 })], GUARDS, NOW)
    expect(out).toHaveLength(1)
    expect(out[0]?.toPrimaryGroupId).toBe(VETERAN)
  })

  it('leaves a user one short', () => {
    expect(evaluatePromotions([rule()], [user({ postCount: 99 })], GUARDS, NOW)).toEqual([])
  })

  it('ANDs every stated criterion', () => {
    const r = rule({ minPostCount: 100, minReputation: 10 })

    expect(evaluatePromotions([r], [user({ postCount: 100, reputation: 9 })], GUARDS, NOW)).toEqual([])
    expect(
      evaluatePromotions([r], [user({ postCount: 100, reputation: 10 })], GUARDS, NOW),
    ).toHaveLength(1)
  })

  it('measures registration age in days', () => {
    const r = rule({ minPostCount: undefined, minDaysRegistered: 30 })

    const recent = user({ registeredAt: new Date('2026-07-20T12:00:00Z') })
    const old = user({ registeredAt: new Date('2026-01-01T00:00:00Z') })

    expect(evaluatePromotions([r], [recent], GUARDS, NOW)).toEqual([])
    expect(evaluatePromotions([r], [old], GUARDS, NOW)).toHaveLength(1)
  })

  it('treats a rule with no criteria as "everyone in the source group"', () => {
    const r = rule({
      minPostCount: undefined,
      fromPrimaryGroupId: AWAITING,
      toPrimaryGroupId: REGISTERED,
    })
    expect(
      evaluatePromotions([r], [user({ primaryGroupId: AWAITING })], GUARDS, NOW),
    ).toHaveLength(1)
  })

  it('only considers users in the source group', () => {
    expect(
      evaluatePromotions([rule()], [user({ postCount: 500, primaryGroupId: GUESTS })], GUARDS, NOW),
    ).toEqual([])
  })

  it('ignores a disabled rule', () => {
    expect(
      evaluatePromotions([rule({ enabled: false })], [user({ postCount: 500 })], GUARDS, NOW),
    ).toEqual([])
  })
})

describe('safety', () => {
  it('never lifts a ban', () => {
    const banned = user({ postCount: 5000, primaryGroupId: BANNED })
    const anyGroup = rule({ fromPrimaryGroupId: null })

    expect(evaluatePromotions([anyGroup], [banned], GUARDS, NOW)).toEqual([])
  })

  it('never demotes a user into a lower-ranked group', () => {
    const admin = user({ postCount: 5000, primaryGroupId: ADMINS })
    const broad = rule({
      minPostCount: 10,
      fromPrimaryGroupId: null,
      toPrimaryGroupId: REGISTERED,
    })

    expect(evaluatePromotions([broad], [admin], GUARDS, NOW)).toEqual([])
  })

  it('refuses a sideways move into an equally ranked group', () => {
    const sideways = rule({
      minPostCount: 0,
      fromPrimaryGroupId: null,
      toPrimaryGroupId: REGISTERED,
    })
    const other = user({ primaryGroupId: VETERAN, postCount: 500 })

    expect(evaluatePromotions([sideways], [other], GUARDS, NOW)).toEqual([])
  })

  it('skips a protected group even when the rule names it as the source', () => {
    const targeted = rule({ fromPrimaryGroupId: BANNED, toPrimaryGroupId: REGISTERED })
    const banned = user({ postCount: 5000, primaryGroupId: BANNED })

    expect(evaluatePromotions([targeted], [banned], GUARDS, NOW)).toEqual([])
  })
})

describe('idempotence', () => {
  it('produces nothing for a user already in the target group', () => {
    expect(
      evaluatePromotions([rule()], [user({ postCount: 500, primaryGroupId: VETERAN })], GUARDS, NOW),
    ).toEqual([])
  })

  it('is stable — the same input yields the same output', () => {
    const users = [user({ userId: 1, postCount: 100 }), user({ userId: 2, postCount: 100 })]
    const first = evaluatePromotions([rule()], users, GUARDS, NOW)
    const second = evaluatePromotions([rule()], users, GUARDS, NOW)
    expect(first).toEqual(second)
  })
})

describe('multiple rules', () => {
  it('applies the first match in display order', () => {
    const rules = [
      rule({ id: 2, title: 'Second', displayOrder: 1, toPrimaryGroupId: 20 }),
      rule({ id: 1, title: 'First', displayOrder: 0, toPrimaryGroupId: VETERAN }),
    ]

    const out = evaluatePromotions(rules, [user({ postCount: 500 })], GUARDS, NOW)
    expect(out).toHaveLength(1)
    expect(out[0]?.ruleTitle).toBe('First')
  })

  it('gives each user at most one outcome', () => {
    const rules = [
      rule({ id: 1, displayOrder: 0 }),
      rule({ id: 2, displayOrder: 1, toPrimaryGroupId: 20 }),
    ]
    const out = evaluatePromotions(rules, [user({ postCount: 500 })], GUARDS, NOW)
    expect(out).toHaveLength(1)
  })

  it('breaks ties on display order by id, so the result is deterministic', () => {
    const rules = [
      rule({ id: 9, title: 'Nine', displayOrder: 0, toPrimaryGroupId: 20 }),
      rule({ id: 4, title: 'Four', displayOrder: 0, toPrimaryGroupId: VETERAN }),
    ]
    expect(
      evaluatePromotions(rules, [user({ postCount: 500 })], GUARDS, NOW)[0]?.ruleTitle,
    ).toBe('Four')
  })

  it('reports which rule fired, so a surprise promotion is explicable', () => {
    const out = evaluatePromotions([rule({ id: 7, title: 'Veteran' })], [user({ postCount: 100 })], GUARDS, NOW)
    expect(out[0]).toMatchObject({ ruleId: 7, ruleTitle: 'Veteran', fromPrimaryGroupId: REGISTERED })
  })
})
