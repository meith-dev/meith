import type { PluginUserStanding } from '@meith/plugin-kit'

export interface AwardRuleInput {
  readonly awardId: number
  readonly title: string
  readonly enabled: boolean
  readonly minPostCount: number | null
  readonly minThreadCount: number | null
  readonly minReputation: number | null
  readonly minDaysRegistered: number | null
}
export interface AwardRule extends AwardRuleInput {
  readonly id: number
}
export const CRITERIA = [
  'minPostCount',
  'minThreadCount',
  'minReputation',
  'minDaysRegistered',
] as const

export function awardRuleProblem(input: AwardRuleInput): 'rule-invalid' | 'rule-empty' | null {
  if (
    !input.title.trim() ||
    input.title.trim().length > 120 ||
    !Number.isSafeInteger(input.awardId) ||
    input.awardId <= 0
  )
    return 'rule-invalid'
  for (const key of CRITERIA) {
    const value = input[key]
    if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 2147483647))
      return 'rule-invalid'
  }
  return CRITERIA.every((key) => input[key] === null) ? 'rule-empty' : null
}

export function parseRule(form: Readonly<Record<string, string>>): AwardRuleInput {
  const threshold = (key: string): number | null => {
    const value = form[key]?.trim() ?? ''
    return value === '' ? null : /^\d+$/.test(value) ? Number(value) : Number.NaN
  }
  return {
    awardId: Number(form.award_id),
    title: (form.title ?? '').trim(),
    enabled: form.enabled === 'on',
    minPostCount: threshold('min_post_count'),
    minThreadCount: threshold('min_thread_count'),
    minReputation: threshold('min_reputation'),
    minDaysRegistered: threshold('min_days_registered'),
  }
}

export function evaluateAwardRules(
  rules: readonly AwardRule[],
  members: readonly PluginUserStanding[],
  now: Date = new Date(),
): Array<{ userId: number; ruleId: number; awardId: number }> {
  const active = rules
    .filter((rule) => rule.enabled && awardRuleProblem(rule) === null)
    .sort((a, b) => a.id - b.id)
  const outcomes: Array<{ userId: number; ruleId: number; awardId: number }> = []
  for (const member of members) {
    for (const rule of active) {
      if (rule.minPostCount !== null && !(member.postCount >= rule.minPostCount)) continue
      if (rule.minThreadCount !== null && !(member.threadCount >= rule.minThreadCount)) continue
      if (rule.minReputation !== null && !(member.reputation >= rule.minReputation)) continue
      if (
        rule.minDaysRegistered !== null &&
        !((now.getTime() - member.registeredAt.getTime()) / 86_400_000 >= rule.minDaysRegistered)
      )
        continue
      outcomes.push({ userId: member.userId, ruleId: rule.id, awardId: rule.awardId })
    }
  }
  return outcomes
}
