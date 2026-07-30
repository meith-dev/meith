/**
 * @forum/db — the only package that speaks SQL.
 *
 * Domain packages must NOT import this (enforced by .dependency-cruiser.cjs).
 * They declare repository interfaces and receive an implementation, so the same
 * logic runs against Postgres in production and the in-memory fixture in tests.
 */

export {
  getDb,
  createIsolatedDb,
  closeDb,
  schema,
  type Database,
} from './client'

export { runMigrations } from './migrate'
export { resultRows } from './result-rows'

export {
  PostgresAuthorizationSource,
  parseAncestorPath,
} from './authorization-source'
export {
  groupRowToPermissionSet,
  forumRowToOverride,
  type PermissionRow,
} from './permissions-map'
export { ActorBuilder, type ActorBuilderConfig } from './actor-builder'
export { PostgresForumRepository } from './forum-repo'
export { PostgresSettingsRepository } from './settings-repo'
export {
  PostgresBanFilterRepository,
  PostgresBanRepository,
} from './ban-repos'
export { PostgresPromotionRepository } from './promotion-repo'
export {
  PostgresAdminRepository,
  type GroupSummary,
  type UserSummary,
} from './admin-repo'
export {
  PostgresAccountRepository,
  PostgresSessionRepository,
  PostgresCredentialTokenRepository,
  PostgresLoginAttemptRepository,
  PostgresRememberTokenRepository,
  createPostgresAccountStore,
} from './account-repos'

export * from './schema'
