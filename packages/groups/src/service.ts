/**
 * Promotion runs (F24).
 *
 * Two entry points over the same evaluation, which is the point: a dry run and
 * a real run must never disagree, so `preview()` and `apply()` differ only in
 * whether the outcomes are written. An ACP preview computed by separate code
 * would eventually lie.
 */
import type { PromotionRepository } from './ports'
import {
  evaluatePromotions,
  type PromotionGuards,
  type PromotionOutcome,
} from './promotion'

export interface PromotionServiceDeps {
  readonly promotions: PromotionRepository
  readonly guards: PromotionGuards
  readonly clock?: () => Date
}

export interface PromotionRunResult {
  readonly outcomes: readonly PromotionOutcome[]
  /** False for a preview. Present so a caller cannot mistake one for the other. */
  readonly applied: boolean
  /** Users examined, so an empty result is distinguishable from an empty board. */
  readonly examined: number
}

export class PromotionService {
  private readonly now: () => Date

  constructor(private readonly deps: PromotionServiceDeps) {
    this.now = deps.clock ?? (() => new Date())
  }

  /** F24: "Dry run reports affected users without writing." */
  async preview(limit = 500): Promise<PromotionRunResult> {
    return this.run(limit, false)
  }

  async apply(limit = 500): Promise<PromotionRunResult> {
    return this.run(limit, true)
  }

  private async run(limit: number, write: boolean): Promise<PromotionRunResult> {
    const rules = await this.deps.promotions.listRules()

    // Nothing configured: skip the user scan entirely rather than paging a
    // 20k-member board to discover there is nothing to do.
    if (rules.length === 0) return { outcomes: [], applied: write, examined: 0 }

    const now = this.now()
    const outcomes: PromotionOutcome[] = []
    let examined = 0
    let afterUserId = 0

    /*
     * Paged by user id rather than OFFSET: applying a promotion changes a
     * user's group, and an OFFSET page over a set being mutated skips rows.
     * Keyset paging on an immutable key does not.
     */
    for (;;) {
      const batch = await this.deps.promotions.candidates(afterUserId, limit)
      if (batch.length === 0) break

      examined += batch.length
      outcomes.push(...evaluatePromotions(rules, batch, this.deps.guards, now))
      afterUserId = batch[batch.length - 1]?.userId ?? afterUserId

      if (batch.length < limit) break
    }

    if (write && outcomes.length > 0) {
      await this.deps.promotions.applyPromotions(outcomes)
    }

    return { outcomes, applied: write, examined }
  }
}
