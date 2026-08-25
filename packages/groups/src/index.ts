export type { PromotionRepository, PromotionRuleRepository } from './ports'
export {
  evaluatePromotions,
  type PromotionCandidate,
  type PromotionGuards,
  type PromotionOutcome,
  type PromotionRule,
} from './promotion'
export { type PromotionRuleInput, promotionRuleProblem } from './promotion-rules'
export {
  PROMOTION_ADVANCE_PAGE,
  PROMOTION_REVIEW_CEILING,
  PROMOTION_REVIEW_PAGE,
  type PromotionAdvanceOptions,
  type PromotionRunResult,
  PromotionService,
  type PromotionServiceDeps,
} from './service'
