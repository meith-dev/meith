import type { PromotionCandidate, PromotionOutcome, PromotionRule } from './promotion'

export interface PromotionRepository {
  listRules(): Promise<readonly PromotionRule[]>

  candidates(afterUserId: number, limit: number): Promise<readonly PromotionCandidate[]>

  applyPromotions(outcomes: readonly PromotionOutcome[]): Promise<void>
}
