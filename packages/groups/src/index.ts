/**
 * @meith/groups — group promotions (F24).
 *
 * Rule evaluation is pure and lives here; the safety guards (never lift a ban,
 * never demote, never re-apply) are part of the domain rather than the SQL.
 */

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
