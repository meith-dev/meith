export {
  evaluatePromotions,
  type PromotionCandidate,
  type PromotionGuards,
  type PromotionOutcome,
  type PromotionRule,
} from './promotion'

export type { PromotionRepository } from './ports'

export {
  PromotionService,
  type PromotionRunResult,
  type PromotionServiceDeps,
} from './service'
