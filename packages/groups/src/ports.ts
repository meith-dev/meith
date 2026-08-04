/**
 * Repository seam for promotions (R2: the domain declares, `@meith/db`
 * implements).
 */
import type { PromotionCandidate, PromotionOutcome, PromotionRule } from './promotion'

export interface PromotionRepository {
  /** Every rule, enabled or not. The set is tiny and read once per run. */
  listRules(): Promise<readonly PromotionRule[]>

  /**
   * A bounded page of users to evaluate, ordered by id so paging is stable.
   *
   * Bounded because a promotion run on a 20k-member board must not load every
   * user into memory (invariant 18) — the task processes a batch per tick and
   * catches up on the next.
   */
  candidates(afterUserId: number, limit: number): Promise<readonly PromotionCandidate[]>

  /**
   * Apply the moves, and bump `permission_version` once for the batch.
   *
   * One transaction: a partially applied batch leaves some users moved with no
   * cache invalidation, so they keep their old permissions while appearing
   * promoted — the confusing half-state that makes people distrust the feature.
   */
  applyPromotions(outcomes: readonly PromotionOutcome[]): Promise<void>
}
