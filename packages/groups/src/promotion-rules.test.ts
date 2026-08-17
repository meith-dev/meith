import { describe, expect, it } from 'vitest'

import { type PromotionRuleInput, promotionRuleProblem } from './promotion-rules'

const BASE: PromotionRuleInput = {
  title: 'Veteran',
  displayOrder: 0,
  minPostCount: 100,
  minReputation: null,
  minDaysRegistered: null,
  fromPrimaryGroupId: 2,
  toPrimaryGroupId: 50,
}

function problem(over: Partial<PromotionRuleInput>): string | null {
  return promotionRuleProblem({ ...BASE, ...over })
}

describe('promotionRuleProblem', () => {
  it('accepts a rule that names a group and one criterion', () => {
    expect(problem({})).toBeNull()
  })

  it('accepts a rule from any group', () => {
    expect(problem({ fromPrimaryGroupId: null })).toBeNull()
  })

  it('accepts zero as a criterion, because it was typed on purpose', () => {
    expect(problem({ minPostCount: 0 })).toBeNull()
  })

  it('refuses a rule with no title', () => {
    expect(problem({ title: '   ' })).toMatch(/needs a title/i)
  })

  it('refuses a rule that promotes a group into itself', () => {
    expect(problem({ fromPrimaryGroupId: 50, toPrimaryGroupId: 50 })).toMatch(/into itself/i)
  })

  it('refuses a rule with no criteria at all', () => {
    const message = problem({
      minPostCount: null,
      minReputation: null,
      minDaysRegistered: null,
    })

    expect(message).toMatch(/every member/i)
  })

  it('refuses a criterion that is not a whole number', () => {
    expect(problem({ minPostCount: Number.NaN })).toMatch(/posts must be a whole number/i)
    expect(problem({ minReputation: 1.5 })).toMatch(/reputation must be a whole number/i)
    expect(problem({ minDaysRegistered: -1 })).toMatch(/days registered/i)
  })

  it('refuses a negative display order', () => {
    expect(problem({ displayOrder: -1 })).toMatch(/display order/i)
  })

  it('refuses a rule with no target group', () => {
    expect(problem({ toPrimaryGroupId: Number.NaN })).toMatch(/promoted into/i)
    expect(problem({ toPrimaryGroupId: 0 })).toMatch(/promoted into/i)
  })

  it('refuses a source group that is not a group id', () => {
    expect(problem({ fromPrimaryGroupId: Number.NaN })).toMatch(/promote from/i)
  })
})
