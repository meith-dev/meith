import { expect, it } from 'vitest'

import { type AwardRule, awardRuleProblem, evaluateAwardRules, parseRule } from './rules'

const rule: AwardRule = {
  id: 1,
  awardId: 2,
  title: 'Contributor',
  enabled: true,
  minPostCount: 10,
  minThreadCount: 2,
  minReputation: 5,
  minDaysRegistered: 30,
}
const now = new Date('2026-09-01T12:00:00Z')
const member = {
  userId: 7,
  username: 'Alice',
  postCount: 10,
  threadCount: 2,
  reputation: 5,
  registeredAt: new Date(now.getTime() - 30 * 86_400_000),
}

it('validates whole thresholds and requires an explicit criterion, including zero', () => {
  expect(awardRuleProblem(rule)).toBeNull()
  for (const key of [
    'minPostCount',
    'minThreadCount',
    'minReputation',
    'minDaysRegistered',
  ] as const) {
    for (const value of [-1, 1.5, NaN, Infinity, 2147483648])
      expect(awardRuleProblem({ ...rule, [key]: value })).toBe('rule-invalid')
  }
  const empty = {
    ...rule,
    minPostCount: null,
    minThreadCount: null,
    minReputation: null,
    minDaysRegistered: null,
  }
  expect(awardRuleProblem(empty)).toBe('rule-empty')
  expect(awardRuleProblem({ ...empty, minPostCount: 0 })).toBeNull()
  expect(awardRuleProblem({ ...rule, title: ' ' })).toBe('rule-invalid')
  expect(awardRuleProblem({ ...rule, awardId: 0 })).toBe('rule-invalid')
  expect(awardRuleProblem(parseRule({ award_id: '2', title: 'A', min_post_count: '1e2' }))).toBe(
    'rule-invalid',
  )
})

it('requires all criteria and matches the exact tenure boundary', () => {
  expect(evaluateAwardRules([rule], [member], now)).toEqual([{ userId: 7, ruleId: 1, awardId: 2 }])
  for (const key of ['postCount', 'threadCount', 'reputation'] as const)
    expect(evaluateAwardRules([rule], [{ ...member, [key]: member[key] - 1 }], now)).toEqual([])
  expect(evaluateAwardRules([rule], [member], new Date(now.getTime() - 1))).toEqual([])
  expect(evaluateAwardRules([{ ...rule, enabled: false }], [member], now)).toEqual([])
})

it('returns every matching rule in deterministic order without mutating inputs', () => {
  const rules = [{ ...rule, id: 3 }, rule]
  expect(evaluateAwardRules(rules, [member], now).map((outcome) => outcome.ruleId)).toEqual([1, 3])
  expect(rules[0]?.id).toBe(3)
  expect(
    evaluateAwardRules(
      [{ ...rule, minDaysRegistered: null }],
      [{ ...member, registeredAt: new Date('2999-01-01') }],
      now,
    ),
  ).toHaveLength(1)
})
