export interface PromotionCandidate {
  readonly userId: number
  readonly postCount: number
  readonly reputation: number
  readonly registeredAt: Date
  readonly primaryGroupId: number | null
}

export interface PromotionRule {
  readonly id: number
  readonly title: string
  readonly enabled: boolean
  readonly displayOrder: number

  readonly minPostCount?: number | undefined
  readonly minReputation?: number | undefined
  readonly minDaysRegistered?: number | undefined

  readonly fromPrimaryGroupId?: number | null | undefined

  readonly toPrimaryGroupId: number
}

export interface PromotionOutcome {
  readonly userId: number
  readonly ruleId: number
  readonly ruleTitle: string
  readonly fromPrimaryGroupId: number | null
  readonly toPrimaryGroupId: number
}

export interface PromotionGuards {
  readonly protectedGroupIds: readonly number[]
  readonly rank?: ReadonlyMap<number, number> | undefined
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 86_400_000
}

function matches(rule: PromotionRule, user: PromotionCandidate, now: Date): boolean {
  if (rule.fromPrimaryGroupId !== null && rule.fromPrimaryGroupId !== undefined) {
    if (user.primaryGroupId !== rule.fromPrimaryGroupId) return false
  }

  if (rule.minPostCount !== undefined && user.postCount < rule.minPostCount) return false
  if (rule.minReputation !== undefined && user.reputation < rule.minReputation) return false
  if (
    rule.minDaysRegistered !== undefined &&
    daysBetween(user.registeredAt, now) < rule.minDaysRegistered
  ) {
    return false
  }

  return true
}

export function evaluatePromotions(
  rules: readonly PromotionRule[],
  candidates: readonly PromotionCandidate[],
  guards: PromotionGuards,
  now: Date = new Date(),
): PromotionOutcome[] {
  const protectedIds = new Set(guards.protectedGroupIds)
  const rankOf = (groupId: number | null): number | undefined =>
    groupId === null ? undefined : guards.rank?.get(groupId)

  const active = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)

  const outcomes: PromotionOutcome[] = []

  for (const user of candidates) {
    if (user.primaryGroupId !== null && protectedIds.has(user.primaryGroupId)) continue

    for (const rule of active) {
      if (!matches(rule, user, now)) continue

      if (user.primaryGroupId === rule.toPrimaryGroupId) break

      const to = rankOf(rule.toPrimaryGroupId)
      const from = rankOf(user.primaryGroupId)
      if (to !== undefined && from !== undefined && to < from) break

      outcomes.push({
        userId: user.userId,
        ruleId: rule.id,
        ruleTitle: rule.title,
        fromPrimaryGroupId: user.primaryGroupId,
        toPrimaryGroupId: rule.toPrimaryGroupId,
      })
      break
    }
  }

  return outcomes
}
