import type { PromotionCandidate, PromotionOutcome, PromotionRule } from './promotion'
import type { PromotionRuleInput } from './promotion-rules'

export interface PromotionRepository {
  listRules(): Promise<readonly PromotionRule[]>

  candidates(afterUserId: number, limit: number): Promise<readonly PromotionCandidate[]>

  applyPromotions(outcomes: readonly PromotionOutcome[]): Promise<void>

  scanCursor(): Promise<number>

  advanceScanCursor(afterUserId: number): Promise<void>
}

export interface PromotionRuleRepository {
  listRules(): Promise<readonly PromotionRule[]>

  createRule(input: PromotionRuleInput): Promise<number>

  updateRule(id: number, input: PromotionRuleInput): Promise<void>

  setRuleEnabled(id: number, enabled: boolean): Promise<void>

  deleteRule(id: number): Promise<void>
}
