/**
 * Promotion rule evaluation (F24).
 *
 * Pure, and deliberately the place where the *safety* rules live rather than
 * the SQL. An automatic group move is a privilege change that nobody approves
 * individually — it runs on a timer, against every user, forever — so the
 * interesting question is not "who qualifies" but "who must this never touch".
 *
 * Three answers, each enforced here and tested:
 *
 *  1. **Never lift a ban.** A banned user with 100 posts and a rule
 *     "100 posts → Veteran" would otherwise be silently unbanned by a cron job.
 *     Un-banning is F23's business and belongs to a moderator.
 *  2. **Never demote.** A rule is a floor, not an assignment. An administrator
 *     who happens to satisfy "10 posts → Registered" must not be moved down to
 *     it, which a naive "matches → set group" implementation does.
 *  3. **Never re-apply.** Someone already in the target group is not promoted
 *     again, which is what makes the task idempotent (F24's acceptance) rather
 *     than merely harmless to repeat.
 */

/** A user as the evaluator sees them. Plain data — no rows, no ORM. */
export interface PromotionCandidate {
  readonly userId: number
  readonly postCount: number
  readonly reputation: number
  readonly registeredAt: Date
  readonly primaryGroupId: number | null
}

/**
 * Criteria are ANDed: every stated threshold must be met. An omitted criterion
 * is not a constraint — a rule with no criteria at all matches everyone in the
 * source group, which is a legitimate "everyone in Awaiting Activation becomes
 * Registered" rule.
 */
export interface PromotionRule {
  readonly id: number
  readonly title: string
  readonly enabled: boolean
  /** Evaluation order; lower first. The first matching rule wins. */
  readonly displayOrder: number

  readonly minPostCount?: number | undefined
  readonly minReputation?: number | undefined
  readonly minDaysRegistered?: number | undefined

  /**
   * Only users currently in this group are considered. `null` means "any
   * group", which is powerful and is why the guards above exist.
   */
  readonly fromPrimaryGroupId?: number | null | undefined

  readonly toPrimaryGroupId: number
}

/** What the rule would do, reported by a dry run and applied by a real one. */
export interface PromotionOutcome {
  readonly userId: number
  readonly ruleId: number
  readonly ruleTitle: string
  readonly fromPrimaryGroupId: number | null
  readonly toPrimaryGroupId: number
}

/**
 * Groups a promotion must never move a user *out of*, regardless of criteria.
 *
 * Passed in rather than hardcoded because group ids are board data — but the
 * caller is expected to supply the banned group and the staff ladder. F20's
 * rule that nothing outside `@meith/authorization` knows what a group id *means*
 * still holds: this compares ids for equality and draws no permission
 * conclusion from them.
 */
export interface PromotionGuards {
  /** Users in any of these are skipped entirely. */
  readonly protectedGroupIds: readonly number[]
  /**
   * Rank per group id, higher = more privileged. A move to a lower rank is a
   * demotion and is refused. Groups absent from the map rank 0.
   */
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

/**
 * Decide which users move, and where.
 *
 * Returns at most one outcome per user: rules are evaluated in `displayOrder`
 * and the first match wins. Two rules that both apply would otherwise produce
 * two writes whose final result depends on ordering that is not obvious from
 * the ACP — better to make "first match" the stated rule.
 */
export function evaluatePromotions(
  rules: readonly PromotionRule[],
  candidates: readonly PromotionCandidate[],
  guards: PromotionGuards,
  now: Date = new Date(),
): PromotionOutcome[] {
  const protectedIds = new Set(guards.protectedGroupIds)
  const rankOf = (groupId: number | null): number =>
    groupId === null ? 0 : (guards.rank?.get(groupId) ?? 0)

  const active = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)

  const outcomes: PromotionOutcome[] = []

  for (const user of candidates) {
    // (1) A banned or staff user is off limits, whatever the criteria say.
    if (user.primaryGroupId !== null && protectedIds.has(user.primaryGroupId)) continue

    for (const rule of active) {
      if (!matches(rule, user, now)) continue

      // (3) Already there — no write, which is what makes repeat runs no-ops.
      if (user.primaryGroupId === rule.toPrimaryGroupId) break

      // (2) A rule is a floor, not an assignment: never move someone down.
      if (rankOf(rule.toPrimaryGroupId) < rankOf(user.primaryGroupId)) break

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
