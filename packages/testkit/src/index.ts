/**
 * @forum/testkit — test support (F11).
 *
 * Excluded from dependency-cruiser and from production bundles: this may import
 * `@forum/db` freely, because its whole job is standing a real database up and
 * measuring what the code does to it.
 */

export {
  createRandom,
  paragraphs,
  words,
  type Random,
} from './random'

export {
  expectQueryBudget,
  measureQueries,
  type QueryBudgetResult,
} from './query-budget'

export {
  seedBoard,
  FULL_SCALE,
  SMOKE_SCALE,
  SEEDED_PASSWORD,
  type SeedScale,
  type SeededBoard,
} from './seed'
