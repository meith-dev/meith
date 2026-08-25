import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
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

import { usergroups, users } from './identity'

export const settingGroups = pgTable(
  'setting_groups',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    key: text('key').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    displayOrder: integer('display_order').notNull().default(0),
  },
  (t) => [uniqueIndex('setting_groups_key_key').on(t.key)],
)

export const settings = pgTable(
  'settings',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    groupKey: text('group_key'),
    updatedByUserId: integer('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('settings_group_idx').on(t.groupKey)],
)

export const themes = pgTable(
  'themes',
  {
    key: text('key').primaryKey(),
    title: text('title').notNull(),

    tokenOverrides: jsonb('token_overrides').notNull().default({}),
    branding: jsonb('branding').notNull().default({}),
    layoutOptions: jsonb('layout_options').notNull().default({}),
    customCss: text('custom_css'),

    isDefault: boolean('is_default').notNull().default(false),

    enabled: boolean('enabled').notNull().default(true),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('themes_single_default_key').on(t.isDefault).where(sql`${t.isDefault}`)],
)

export const outbox = pgTable(
  'outbox',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull(),

    correlationId: text('correlation_id'),

    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    attempts: smallint('attempts').notNull().default(0),
    lastError: text('last_error'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('outbox_pending_idx').on(t.id).where(sql`${t.dispatchedAt} is null`)],
)

export const jobs = pgTable(
  'jobs',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull().default({}),

    status: text('status').notNull().default('pending'),

    idempotencyKey: text('idempotency_key'),

    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    attempts: smallint('attempts').notNull().default(0),
    maxAttempts: smallint('max_attempts').notNull().default(5),

    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lockedBy: text('locked_by'),

    lastError: text('last_error'),
    correlationId: text('correlation_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('jobs_pending_idx').on(t.status, t.runAt).where(sql`${t.status} = 'pending'`),

    uniqueIndex('jobs_idempotency_key')
      .on(t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null and ${t.status} = 'pending'`),

    index('jobs_status_idx').on(t.status),
  ],
)

export const tasks = pgTable('tasks', {
  key: text('key').primaryKey(),

  intervalSeconds: integer('interval_seconds').notNull(),

  enabled: boolean('enabled').notNull().default(true),

  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull().defaultNow(),

  lockedUntil: timestamp('locked_until', { withTimezone: true }),

  consecutiveFailures: smallint('consecutive_failures').notNull().default(0),
})

export const taskLog = pgTable(
  'task_log',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    taskKey: text('task_key').notNull(),
    succeeded: boolean('succeeded').notNull(),
    durationMs: integer('duration_ms'),
    detail: text('detail'),
    error: text('error'),
    ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('task_log_key_ran_idx').on(t.taskKey, t.ranAt.desc())],
)

export const cacheVersions = pgTable('cache_versions', {
  key: text('key').primaryKey(),
  version: integer('version').notNull().default(1),
  bumpedAt: timestamp('bumped_at', { withTimezone: true }).notNull().defaultNow(),
})

export const pluginHealth = pgTable('plugin_health', {
  pluginKey: text('plugin_key').primaryKey(),
  failures: integer('failures').notNull().default(0),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  reason: text('reason'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * The cached copy of the meith.dev marketplace feed (or a self-hosted
 * mirror's) — a single row, refreshed daily by a task and on demand by the
 * admin panel's "Refresh" button. `feed` and `fetchedAt` are null until the
 * first successful fetch; `error`/`errorAt` describe the most recent failed
 * attempt, cleared on the next success, so a board with no outbound network
 * shows a plain "unreachable" note rather than nothing. `notifiedUpdates`
 * carries `"<plugin key>@<version>"` strings, one per update notification
 * ever sent, which is what makes that notification fire once per version —
 * not once per unread bell entry, which the notification service's own
 * dedupe key gives up on as soon as the entry is read.
 */
export const marketplaceCatalog = pgTable(
  'marketplace_catalog',
  {
    id: smallint('id').primaryKey().default(1),
    feed: jsonb('feed'),
    /** The feed URL the cached copy was actually fetched from — screenshots are
     *  absolute *paths*, resolved against this rather than against whatever the
     *  setting reads today, so a mid-day setting change cannot point an old
     *  cached screenshot at the wrong host. */
    sourceUrl: text('source_url'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
    error: text('error'),
    errorAt: timestamp('error_at', { withTimezone: true }),
    notifiedUpdates: jsonb('notified_updates').notNull().default([]),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('marketplace_catalog_single_row', sql`${t.id} = 1`)],
)

export const adminLog = pgTable(
  'admin_log',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    detail: jsonb('detail').notNull().default({}),
    ipPrefix: text('ip_prefix'),
    correlationId: text('correlation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('admin_log_user_idx').on(t.userId, t.createdAt.desc()),
    index('admin_log_action_idx').on(t.action, t.createdAt.desc()),
    index('admin_log_forum_scope_idx').using(
      'gin',
      sql`(${t.detail} -> 'forumIds') jsonb_path_ops`,
    ),
  ],
)

export const adminUndoOperations = pgTable(
  'admin_undo_operations',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    tokenHash: text('token_hash').notNull(),
    actorUserId: integer('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    operation: text('operation').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('admin_undo_operations_token_key').on(t.tokenHash),
    index('admin_undo_operations_live_idx').on(t.actorUserId, t.expiresAt),
  ],
)

export const contentCounterRollups = pgTable('content_counter_rollups', {
  postId: integer('post_id').primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
})

export const counterRecountState = pgTable('counter_recount_state', {
  id: text('id').primaryKey(),
  phase: text('phase').notNull().default('threads'),
  cursor: integer('cursor').notNull().default(0),
  passes: integer('passes').notNull().default(0),
  corrected: integer('corrected').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const promotionScanState = pgTable('promotion_scan_state', {
  id: text('id').primaryKey(),
  cursor: integer('cursor').notNull().default(0),
  passes: integer('passes').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const massMails = pgTable('mass_mails', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  targetGroupId: integer('target_group_id').references(() => usergroups.id, {
    onDelete: 'set null',
  }),
  lastUserId: integer('last_user_id').notNull().default(0),
  queuedCount: integer('queued_count').notNull().default(0),
  status: text('status').notNull().default('sending'),
  createdByUserId: integer('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
})

export const searches = pgTable(
  'searches',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    token: text('token').notNull(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    sessionKey: text('session_key'),
    terms: text('terms').notNull(),
    filters: jsonb('filters').notNull().default({}),
    hitCount: integer('hit_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('searches_token_key').on(t.token),
    index('searches_user_recent_idx').on(t.userId, t.createdAt),
    index('searches_session_recent_idx').on(t.sessionKey, t.createdAt),
  ],
)

export const boardStats = pgTable(
  'board_stats',
  {
    id: smallint('id').primaryKey().default(1),

    threadCount: integer('thread_count').notNull().default(0),
    postCount: integer('post_count').notNull().default(0),
    memberCount: integer('member_count').notNull().default(0),

    newestUserId: integer('newest_user_id'),
    newestUsername: text('newest_username'),

    mostOnlineCount: integer('most_online_count').notNull().default(0),
    mostOnlineAt: timestamp('most_online_at', { withTimezone: true }),

    computedAt: timestamp('computed_at', { withTimezone: true }),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('board_stats_singleton', sql`${t.id} = 1`)],
)

export const rateLimits = pgTable(
  'rate_limits',
  {
    scope: text('scope').notNull(),
    subject: text('subject').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    used: integer('used').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.scope, t.subject, t.windowStart] }),
    index('rate_limits_window_idx').on(t.windowStart),
  ],
)

export const captchaQuestions = pgTable('captcha_questions', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  question: text('question').notNull(),
  answers: text('answers').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const NAVIGATION_AUDIENCES = ['all', 'guests', 'members', 'staff'] as const

export const navigationItems = pgTable(
  'navigation_items',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    key: text('key'),
    parentId: integer('parent_id'),
    label: text('label').notNull().default(''),
    href: text('href').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    audience: text('audience').notNull().default('all'),
    newTab: boolean('new_tab').notNull().default(false),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('navigation_items_key_key').on(t.key).where(sql`${t.key} is not null`),
    index('navigation_items_order_idx').on(t.parentId, t.displayOrder, t.id),
    foreignKey({
      columns: [t.parentId],
      foreignColumns: [t.id],
      name: 'navigation_items_parent_id_fk',
    }).onDelete('cascade'),
    check(
      'navigation_items_audience_check',
      sql`${t.audience} in ('all', 'guests', 'members', 'staff')`,
    ),
  ],
)

export const navigationItemGroups = pgTable(
  'navigation_item_groups',
  {
    itemId: integer('item_id')
      .notNull()
      .references(() => navigationItems.id, { onDelete: 'cascade' }),
    groupId: integer('group_id')
      .notNull()
      .references(() => usergroups.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.groupId] }),
    index('navigation_item_groups_group_idx').on(t.groupId),
  ],
)
