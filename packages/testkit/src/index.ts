/**
 * @meith/testkit — test support (F11).
 *
 * Excluded from dependency-cruiser and from production bundles: this may import
 * `@meith/db` freely, because its whole job is standing a real database up and
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
  cacheDriverContract,
  fileStoreContract,
  mailDriverContract,
  queueDriverContract,
  type DriverFactory,
} from './driver-contracts'

export {
  seedBoard,
  FULL_SCALE,
  SMOKE_SCALE,
  SEEDED_PASSWORD,
  type SeedScale,
  type SeededBoard,
} from './seed'

export {
  createFactories,
  type FactoryForum,
  type FactoryPost,
  type FactoryThread,
  type FactoryUser,
  type ForumFactoryOptions,
  type PostFactoryOptions,
  type ThreadFactoryOptions,
  type UserFactoryOptions,
} from './factories'
