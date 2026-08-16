import type { PromotionRule } from '@meith/groups'

export interface PromotionRuleFormValues {
  readonly id: number
  readonly title: string
  readonly enabled: boolean
  readonly displayOrder: string
  readonly minPostCount: string
  readonly minReputation: string
  readonly minDaysRegistered: string
  readonly fromPrimaryGroupId: string
  readonly toPrimaryGroupId: string
}

function field(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

export function promotionRuleFormValues(rule: PromotionRule): PromotionRuleFormValues {
  return {
    id: rule.id,
    title: rule.title,
    enabled: rule.enabled,
    displayOrder: String(rule.displayOrder),
    minPostCount: field(rule.minPostCount),
    minReputation: field(rule.minReputation),
    minDaysRegistered: field(rule.minDaysRegistered),
    fromPrimaryGroupId: field(rule.fromPrimaryGroupId),
    toPrimaryGroupId: String(rule.toPrimaryGroupId),
  }
}

export function promotionRuleSummary(
  rule: PromotionRule,
  groupTitle: (id: number | null) => string,
): string {
  const criteria: string[] = []
  if (rule.minPostCount !== undefined) criteria.push(`${rule.minPostCount} posts`)
  if (rule.minReputation !== undefined) criteria.push(`${rule.minReputation} reputation`)
  if (rule.minDaysRegistered !== undefined) {
    criteria.push(`${rule.minDaysRegistered} days registered`)
  }

  const from =
    rule.fromPrimaryGroupId === null || rule.fromPrimaryGroupId === undefined
      ? 'any group'
      : groupTitle(rule.fromPrimaryGroupId)

  const wants = criteria.length === 0 ? 'no criteria' : `at least ${criteria.join(', ')}`

  return `${from} → ${groupTitle(rule.toPrimaryGroupId)} · ${wants}`
}
