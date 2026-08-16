export {
  evaluatePromotions,
  type PromotionCandidate,
  type PromotionGuards,
  type PromotionOutcome,
  type PromotionRule,
} from './promotion'

export { promotionRuleProblem, type PromotionRuleInput } from './promotion-rules'

export type { PromotionRepository, PromotionRuleRepository } from './ports'

export {
  PromotionService,
  type PromotionRunResult,
  type PromotionServiceDeps,
} from './service'
