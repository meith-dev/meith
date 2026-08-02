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
export { PostgresThreadRepository } from './thread-repo'
export { PostgresThreadWriteRepository } from './thread-writes'
export { PostgresPostRepository } from './post-repo'
export { PostgresReadStateRepository } from './read-state-repo'
export { PostgresMemberProfileRepository } from './member-profile-repo'
export { PostgresSettingsRepository } from './settings-repo'
export { PostgresThemeRepository, type ThemeRuntimeRecord } from './theme-repo'
export {
  applyCreatedContentCounters,
  rollUpAncestorCounters,
  PostgresContentCounterRepository,
  type CreatedContent,
} from './content-counters'
export { PostgresThreadViewBuffer } from './thread-views'
export {
  PostgresCounterRecount,
  RECOUNT_PHASES,
  type RecountPhase,
  type RecountRun,
} from './counter-recount'
export {
  PostgresRenderBackfill,
  type RenderBackfillRun,
} from './render-backfill'
export { PostgresPostWriteRepository } from './post-writes'
export { PostgresModerationQueueRepository } from './moderation-queue'
export { PostgresMemberSettingsRepository } from './member-settings-repo'
export { PostgresNotificationRepository } from './notification-repo'
export { PostgresProfileFieldRepository } from './profile-field-repo'
export { PostgresMessageRepository } from './message-repo'
export { PostgresAttachmentRepository } from './attachment-repo'
export { PostgresRelationRepository } from './relation-repo'
export { PostgresReputationRepository } from './reputation-repo'
export { PostgresSignatureRepository } from './signature-repo'
export {
  PostgresAdminLogRepository,
  PostgresAdminSessionRepository,
} from './admin-session-repo'
export { PostgresReportRepository } from './report-repo'
export { PostgresSubscriptionRepository } from './subscription-repo'
export { PostgresThreadToolsRepository } from './thread-tools'
export { PostgresThreadSurgeryRepository } from './thread-surgery'
export { PostgresInlineModerationRepository } from './inline-moderation'
export { PostgresWarningRepository } from './warning-repo'
export { PostgresModCpRepository } from './modcp-repo'
export {
  applyAncestorVisibilityChange,
  applyVisibilityChangeCounters,
  repairForumLastPostChain,
  repairThreadLastPost,
  type VisibilityChange,
} from './visibility-counters'
export { PostgresOutboxReader } from './outbox-repo'
export {
  PostgresBanFilterRepository,
  PostgresBanRepository,
} from './ban-repos'
export { PostgresPromotionRepository } from './promotion-repo'
export { PostgresTaskRepository } from './task-repo'
export { PostgresMaintenanceRepository } from './maintenance-repo'
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
