import { describe, expect, it } from 'vitest'

import type { PromotionRule } from '@meith/groups'

import { promotionRuleFormValues, promotionRuleSummary } from './promotion-rules'

const RULE: PromotionRule = {
  id: 4,
  title: 'Veteran',
  enabled: true,
  displayOrder: 3,
  minPostCount: 100,
  fromPrimaryGroupId: 2,
  toPrimaryGroupId: 50,
}

const TITLES = new Map([
  [2, 'Registered'],
  [50, 'Veteran'],
])

const title = (id: number | null): string =>
  id === null ? 'no group' : (TITLES.get(id) ?? `group ${id}`)

describe('promotionRuleFormValues', () => {
  it('renders an absent criterion as a blank field', () => {
    const values = promotionRuleFormValues(RULE)

    expect(values.minReputation).toBe('')
    expect(values.minDaysRegistered).toBe('')
  })

  it('renders a zero criterion as "0", not as blank', () => {
    const values = promotionRuleFormValues({ ...RULE, minPostCount: 0, minReputation: 0 })

    expect(values.minPostCount).toBe('0')
    expect(values.minReputation).toBe('0')
  })

  it('renders "any group" as a blank source', () => {
    expect(promotionRuleFormValues({ ...RULE, fromPrimaryGroupId: null }).fromPrimaryGroupId).toBe(
      '',
    )
  })

  it('carries the identity the form posts back', () => {
    const values = promotionRuleFormValues(RULE)

    expect(values).toMatchObject({
      id: 4,
      title: 'Veteran',
      enabled: true,
      displayOrder: '3',
      toPrimaryGroupId: '50',
    })
  })
})

describe('promotionRuleSummary', () => {
  it('names the groups and every criterion the rule sets', () => {
    const summary = promotionRuleSummary(
      { ...RULE, minReputation: 5, minDaysRegistered: 30 },
      title,
    )

    expect(summary).toBe(
      'Registered → Veteran · at least 100 posts, 5 reputation, 30 days registered',
    )
  })

  it('says "any group" when the rule does not care where they came from', () => {
    expect(promotionRuleSummary({ ...RULE, fromPrimaryGroupId: null }, title)).toBe(
      'any group → Veteran · at least 100 posts',
    )
  })
})
