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
  type PromotionRunResult,
  PromotionService,
  type PromotionServiceDeps,
} from './service'
