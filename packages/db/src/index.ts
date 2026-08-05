/**
 * @meith/db — the only package that speaks SQL.
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
export { PostgresImportSink } from './import-sink'
export { PostgresMemberProfileRepository } from './member-profile-repo'
export { PostgresSettingsRepository } from './settings-repo'
export {
  PostgresGroupIdentityRepository,
  type GroupIdentity,
} from './group-identity-repo'
export {
  PostgresThemeRepository,
  type ThemeRuntimeRecord,
  type ThemeRuntimeState,
} from './theme-repo'
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
/* F71 — the ACP's attachment listing. */
export {
  PostgresAttachmentAdminRepository,
  type AttachmentAdminFilter,
  type AttachmentAdminPage,
  type AttachmentAdminRow,
  type AttachmentTotals,
} from './attachment-admin-repo'
export { PostgresAvatarRepository } from './avatar-repo'
export {
  PostgresGroupAdminRepository,
  type GroupIdentityInput,
  type GroupSummaryRow,
  type MembershipChunkResult,
} from './group-admin-repo'
export {
  PostgresUserAdminRepository,
  likeFragment,
  type AccountState,
  type UserAccountInput,
  type UserDetail,
  type UserSearchFilter,
  type UserSearchPage,
  type UserSearchRow,
} from './user-admin-repo'
export {
  PostgresUserMergeRepository,
  type MergeChunkResult,
  type MergePreview,
} from './user-merge-repo'
export { mergeMapColumns } from './user-merge-map'
export {
  PostgresThemeAdminRepository,
  parseThemeExport,
  type ThemeExport,
  type ThemeRecord,
} from './theme-admin-repo'
export {
  PostgresUserBulkRepository,
  type MassMailChunk,
  type MassMailRecipient,
  type MassMailRow,
  type PruneChunkResult,
  type PruneCriteria,
  type PrunePreview,
} from './user-bulk-repo'
export {
  MODERATOR_RIGHTS,
  PostgresForumAdminRepository,
  type AppointModeratorInput,
  type ForumOptionsInput,
  type ModeratorAppointmentRow,
  type ModeratorRight,
} from './forum-admin-repo'
export { PostgresRelationRepository } from './relation-repo'
export { PostgresReputationRepository } from './reputation-repo'
export { PostgresPollRepository } from './poll-repo'
export { PostgresDraftRepository } from './draft-repo'
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
export {
  PostgresSystemHealthRepository,
  type BoardVolumes,
  type RecountStateRow,
  type TaskRunRow,
} from './system-health-repo'
export { PostgresMaintenanceRepository } from './maintenance-repo'
export {
  PostgresSearchRepository,
  searchVectorSql,
  type ReindexResult,
} from './search-repo'
export {
  PostgresFeedRepository,
  type FeedPost,
  type FeedScope,
  type FeedThread,
  type SitemapForum,
  type SitemapThread,
} from './feed-repo'
export {
  ONLINE_WINDOW_MINUTES,
  PostgresPresenceRepository,
  type OnlineMember,
  type OnlineRecord,
  type OnlineScope,
  type OnlineSnapshot,
} from './presence-repo'
export {
  PostgresStatsRepository,
  type BoardTotals,
  type StatsScope,
  type TopPoster,
  type TopThread,
} from './stats-repo'
export {
  PostgresDiscoveryRepository,
  type DiscoveryPage,
  type DiscoveryQuery,
  type DiscoveryRow,
  type DiscoveryScope,
} from './discovery-repo'
export {
  PostgresSearchStore,
  ownsSearch,
  type CreateSearchInput,
  type StoredSearch,
} from './search-store'
export {
  PostgresContentAdminRepository,
  type DirectiveRow,
  type SmileyRow,
  type ThreadPrefixRow,
  type WordFilterRow,
} from './content-admin-repo'
/* F46 — anti-spam: the rate-limit counter and the captcha questions. */
export {
  PostgresCaptchaQuestionRepository,
  PostgresRateLimitBucketStore,
  type CaptchaQuestionRow,
} from './antispam-repo'
/* F71 — announcements. */
export {
  PostgresAnnouncementRepository,
  type AnnouncementInput,
  type AnnouncementRow,
} from './announcement-repo'
/* F71 — the compiled vocabulary, for the render and write paths. */
export { readBoardVocabulary } from './vocabulary-repo'
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

/* F81 — the public API's stores. */
export {
  PostgresApiTokenRepository,
  type ApiTokenSummary,
  PostgresRateLimitStore,
  PostgresWebhookRepository,
  type WebhookDeliveryRow,
} from './api-repo'

/* F83 — the installer's probes and its one write. */
export { canConnect, countUsers, isInstalled, markInstalled } from './install-repo'

/* F84 — component versions and the plugin migration runner. */
export {
  appliedPluginMigrations,
  applyPluginMigration,
  readVersion,
  readVersions,
  recordVersion,
} from './upgrade-repo'

/* F85 — the legacy-id map and the import run's state. */
export {
  currentImportRun,
  finishImportRun,
  mapLegacyId,
  resolveLegacyId,
  resolveLegacyIds,
  saveImportProgress,
  startImportRun,
  type ImportRunRow,
  type LegacyKind,
} from './import-repo'
