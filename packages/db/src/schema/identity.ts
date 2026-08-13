import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import { groupPermissionColumns } from './permission-columns'

export const usergroups = pgTable(
  'usergroups',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    key: text('key').notNull(),
    title: text('title').notNull(),
    description: text('description'),

    badgeToken: text('badge_token'),

    nameColorLight: text('name_color_light'),
    nameColorDark: text('name_color_dark'),

    badgeImageLight: text('badge_image_light'),
    badgeImageDark: text('badge_image_dark'),

    displayOrder: integer('display_order').notNull().default(0),

    isSystem: boolean('is_system').notNull().default(false),

    isStaffGroup: boolean('is_staff_group').notNull().default(false),

    pluginGrantable: boolean('plugin_grantable').notNull().default(false),

    ...groupPermissionColumns(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('usergroups_key_key').on(t.key),
    index('usergroups_display_order_idx').on(t.displayOrder),
  ],
)

export const USER_STATES = [
  'active',
  'awaiting_activation',
  'awaiting_approval',
  'banned',
  'deleted',
] as const

export const users = pgTable(
  'users',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    username: text('username').notNull(),
    usernameLower: text('username_lower').notNull(),

    email: text('email').notNull(),
    emailLower: text('email_lower').notNull(),

    passwordHash: text('password_hash'),
    passwordAlgo: text('password_algo'),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),

    primaryGroupId: integer('primary_group_id')
      .notNull()
      .references(() => usergroups.id, { onDelete: 'restrict' }),
    displayGroupId: integer('display_group_id').references(() => usergroups.id, {
      onDelete: 'set null',
    }),

    state: text('state').notNull().default('active'),

    postCount: integer('post_count').notNull().default(0),
    threadCount: integer('thread_count').notNull().default(0),
    reputation: integer('reputation').notNull().default(0),
    warningPoints: smallint('warning_points').notNull().default(0),

    signature: text('signature').notNull().default(''),
    signatureHtml: text('signature_html'),
    signatureRenderVersion: smallint('signature_render_version').notNull().default(0),
    signatureFormat: smallint('signature_format').notNull().default(1),
    signatureLocked: boolean('signature_locked').notNull().default(false),
    signatureLockedReason: text('signature_locked_reason'),

    avatarStatus: text('avatar_status').notNull().default('none'),
    avatarKey: text('avatar_key'),
    avatarSourceKey: text('avatar_source_key'),
    avatarWidth: integer('avatar_width'),
    avatarHeight: integer('avatar_height'),
    avatarFailureReason: text('avatar_failure_reason'),
    avatarUpdatedAt: timestamp('avatar_updated_at', { withTimezone: true }),
    avatarLocked: boolean('avatar_locked').notNull().default(false),
    avatarLockedReason: text('avatar_locked_reason'),

    registrationIpPrefix: text('registration_ip_prefix'),
    lastIpPrefix: text('last_ip_prefix'),

    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),

    suspendedPostingUntil: timestamp('suspended_posting_until', { withTimezone: true }),
    moderatedPostingUntil: timestamp('moderated_posting_until', { withTimezone: true }),

    timezone: text('timezone').notNull().default('auto'),
    postsPerPage: smallint('posts_per_page'),
    threadsPerPage: smallint('threads_per_page'),
    invisible: boolean('invisible').notNull().default(false),

    location: text('location'),
    website: text('website'),
    bio: text('bio'),

    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    legacyMybbUid: integer('legacy_mybb_uid'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('users_username_lower_key').on(t.usernameLower),
    uniqueIndex('users_email_lower_key').on(t.emailLower),
    uniqueIndex('users_legacy_mybb_uid_key')
      .on(t.legacyMybbUid)
      .where(sql`${t.legacyMybbUid} is not null`),
    index('users_primary_group_idx').on(t.primaryGroupId),
    index('users_active_created_idx')
      .on(t.createdAt)
      .where(sql`${t.state} = 'active'`),
    index('users_last_active_idx').on(t.lastActiveAt),
    index('users_signature_render_version_idx')
      .on(t.signatureRenderVersion, t.id)
      .where(sql`${t.signature} <> ''`),
  ],
)

export const userGroupMemberships = pgTable(
  'user_group_memberships',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    groupId: integer('group_id')
      .notNull()
      .references(() => usergroups.id, { onDelete: 'cascade' }),

    isDisplayGroup: boolean('is_display_group').notNull().default(false),

    grantedByUserId: integer('granted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    expiresAt: timestamp('expires_at', { withTimezone: true }),
    grantedByPlugin: text('granted_by_plugin'),
    grantReason: text('grant_reason'),
  },
  (t) => [
    uniqueIndex('user_group_memberships_pkey').on(t.userId, t.groupId),
    index('user_group_memberships_user_idx').on(t.userId),
    index('user_group_memberships_group_idx').on(t.groupId),
    index('user_group_memberships_expiry_idx')
      .on(t.expiresAt)
      .where(sql`${t.expiresAt} is not null`),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    tokenHash: text('token_hash').notNull(),

    userId: integer('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),

    locationPath: text('location_path'),
    locationForumId: integer('location_forum_id'),
    locationThreadId: integer('location_thread_id'),

    ipPrefix: text('ip_prefix'),
    userAgent: text('user_agent'),

    supersededBySessionId: integer('superseded_by_session_id'),

    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_last_seen_idx').on(t.lastSeenAt),
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
)

export const rememberTokens = pgTable(
  'remember_tokens',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    tokenHash: text('token_hash').notNull(),

    familyId: text('family_id').notNull(),

    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    usedAt: timestamp('used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),

    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('remember_tokens_hash_key').on(t.tokenHash),
    index('remember_tokens_family_idx').on(t.familyId),
    index('remember_tokens_user_idx').on(t.userId),
    index('remember_tokens_expires_idx').on(t.expiresAt),
  ],
)

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    bucket: text('bucket').notNull(),
    succeeded: boolean('succeeded').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('login_attempts_bucket_idx').on(t.bucket, t.occurredAt)],
)

export const credentialTokens = pgTable(
  'credential_tokens',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    tokenHash: text('token_hash').notNull(),

    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    purpose: text('purpose').notNull(),
    payload: text('payload'),

    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('credential_tokens_hash_key').on(t.tokenHash),
    index('credential_tokens_user_purpose_idx').on(t.userId, t.purpose),
    index('credential_tokens_expires_idx').on(t.expiresAt),
  ],
)

export const bans = pgTable(
  'bans',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    bannedByUserId: integer('banned_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    reason: text('reason'),
    publicReason: text('public_reason'),

    previousPrimaryGroupId: integer('previous_primary_group_id').references(
      () => usergroups.id,
      { onDelete: 'set null' },
    ),

    expiresAt: timestamp('expires_at', { withTimezone: true }),
    liftedAt: timestamp('lifted_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('bans_active_user_key')
      .on(t.userId)
      .where(sql`${t.liftedAt} is null`),
    index('bans_expires_idx')
      .on(t.expiresAt)
      .where(sql`${t.liftedAt} is null`),
  ],
)

export const banFilters = pgTable(
  'ban_filters',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    type: text('type').notNull(),
    pattern: text('pattern').notNull(),
    note: text('note'),
    createdByUserId: integer('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('ban_filters_type_idx').on(t.type),
    uniqueIndex('ban_filters_type_pattern_key').on(t.type, t.pattern),
  ],
)

export const groupPromotions = pgTable(
  'group_promotions',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    title: text('title').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    displayOrder: integer('display_order').notNull().default(0),

    minPostCount: integer('min_post_count'),
    minReputation: integer('min_reputation'),
    minDaysRegistered: integer('min_days_registered'),

    fromPrimaryGroupId: integer('from_primary_group_id').references(() => usergroups.id, {
      onDelete: 'cascade',
    }),
    toPrimaryGroupId: integer('to_primary_group_id')
      .notNull()
      .references(() => usergroups.id, { onDelete: 'cascade' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('group_promotions_order_idx').on(t.displayOrder, t.id)],
)

export const warningTypes = pgTable(
  'warning_types',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    title: text('title').notNull(),
    points: smallint('points').notNull().default(1),
    expiryDays: integer('expiry_days'),
    isActive: boolean('is_active').notNull().default(true),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('warning_types_order_idx').on(t.displayOrder, t.id)],
)

export const warningLevels = pgTable(
  'warning_levels',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    points: smallint('points').notNull(),
    action: text('action').notNull(),
    durationDays: integer('duration_days'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('warning_levels_points_unique').on(t.points)],
)

export const warnings = pgTable(
  'warnings',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    issuedByUserId: integer('issued_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    typeId: integer('type_id').references(() => warningTypes.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    points: smallint('points').notNull(),
    reason: text('reason').notNull().default(''),

    postId: integer('post_id'),
    reportId: integer('report_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByUserId: integer('revoked_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    revokeReason: text('revoke_reason'),
  },
  (t) => [index('warnings_user_idx').on(t.userId, t.createdAt, t.id)],
)

export const notifications = pgTable(
  'notifications',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    kind: text('kind').notNull(),
    data: jsonb('data').notNull().default({}),
    href: text('href'),

    dedupeKey: text('dedupe_key'),
    occurrences: integer('occurrences').notNull().default(1),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
    emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
  },
  (t) => [
    index('notifications_user_idx').on(t.userId, t.createdAt.desc(), t.id.desc()),
    index('notifications_unread_idx')
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
    uniqueIndex('notifications_dedupe_idx')
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.readAt} is null and ${t.dedupeKey} is not null`),
  ],
)

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    email: boolean('email').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'notification_preferences_pkey', columns: [t.userId, t.kind] }),
  ],
)

export const profileFields = pgTable(
  'profile_fields',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    key: text('key').notNull(),
    label: text('label').notNull(),
    description: text('description'),

    type: text('type').notNull().default('text'),
    options: jsonb('options').notNull().default([]),
    maxLength: integer('max_length'),

    displayOrder: integer('display_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    requiredAtRegistration: boolean('required_at_registration').notNull().default(false),

    defaultVisible: boolean('default_visible').notNull().default(true),
    defaultEditable: boolean('default_editable').notNull().default(true),

    showInPostbit: boolean('show_in_postbit').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('profile_fields_key_unique').on(t.key),
    index('profile_fields_order_idx').on(t.displayOrder, t.id),
  ],
)

export const profileFieldGroups = pgTable(
  'profile_field_groups',
  {
    fieldId: integer('field_id')
      .notNull()
      .references(() => profileFields.id, { onDelete: 'cascade' }),
    groupId: integer('group_id')
      .notNull()
      .references(() => usergroups.id, { onDelete: 'cascade' }),
    canView: boolean('can_view'),
    canEdit: boolean('can_edit'),
  },
  (t) => [
    primaryKey({ name: 'profile_field_groups_pkey', columns: [t.fieldId, t.groupId] }),
  ],
)

export const profileFieldValues = pgTable(
  'profile_field_values',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fieldId: integer('field_id')
      .notNull()
      .references(() => profileFields.id, { onDelete: 'cascade' }),
    value: text('value').notNull().default(''),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'profile_field_values_pkey', columns: [t.userId, t.fieldId] }),
    index('profile_field_values_user_idx').on(t.userId),
  ],
)

export const userRelations = pgTable(
  'user_relations',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    otherUserId: integer('other_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'user_relations_pkey', columns: [t.userId, t.otherUserId] }),
    index('user_relations_kind_idx').on(t.userId, t.kind, t.otherUserId),
    index('user_relations_reverse_idx').on(t.otherUserId, t.kind),
  ],
)

export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    ipPrefix: text('ip_prefix'),
    authenticatedAt: timestamp('authenticated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('admin_sessions_token_hash_key').on(t.tokenHash),
    index('admin_sessions_user_idx').on(t.userId),
    index('admin_sessions_expiry_idx').on(t.expiresAt),
  ],
)
