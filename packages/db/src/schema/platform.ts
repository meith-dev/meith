/**
 * R3.4 system tables needed by Phase 0: `settings`, `setting_groups`, `themes`,
 * `tasks`, `task_log`, `jobs`, `outbox`, `cache_versions`, `admin_log`.
 *
 * These are the machinery features (F06–F10) rather than the product. Nothing
 * here is user-visible, and everything here exists because serverless forbids
 * the easy version: no in-process scheduler, no long-lived worker, no
 * "just publish the event after committing".
 */

import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import { users } from './identity'

/**
 * Setting groups — presentation only, for the ACP's tabs (F58).
 */
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

/**
 * Settings storage (F08).
 *
 * The *registry* — key, type, default, validation — lives in code in
 * `packages/settings`. This table holds only values that differ from the
 * registry default. A key present here but absent from the registry is ignored
 * and reported, never trusted: that is how a removed setting stops being live
 * config the moment its code is deleted.
 *
 * F08 requires settings be added by migration, never inserted ad hoc.
 */
export const settings = pgTable(
  'settings',
  {
    key: text('key').primaryKey(),
    /**
     * JSON-encoded value. Text with a codec rather than a jsonb column: the
     * registry already owns parsing and validation per type, and jsonb would
     * invite querying settings by shape, which nothing should ever do.
     */
    value: text('value').notNull(),
    groupKey: text('group_key'),
    updatedByUserId: integer('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('settings_group_idx').on(t.groupKey)],
)

/**
 * Theme runtime overrides (R3.4): "**runtime overrides for a code-defined
 * theme** — token_overrides, branding, layout_options, custom_css — keyed by
 * theme key. **Never markup.**"
 *
 * The absence of a markup column is the point. Storing templates in the
 * database is what made MyBB theming a security surface and an upgrade hazard;
 * here a theme is code, and this table can only retint it.
 */
export const themes = pgTable(
  'themes',
  {
    /** Matches a theme key registered in `forum.config.ts` (R1 rule 6). */
    key: text('key').primaryKey(),
    title: text('title').notNull(),

    /**
     * Partial map of R7 token name -> CSS value. Validated against the theme's
     * declared token list on write; an unknown token name is rejected rather
     * than stored and silently ignored.
     */
    tokenOverrides: jsonb('token_overrides').notNull().default({}),
    /** Board title, logo URL, favicon. */
    branding: jsonb('branding').notNull().default({}),
    /** Theme-declared layout switches, e.g. compact rows. */
    layoutOptions: jsonb('layout_options').notNull().default({}),
    /**
     * Escape hatch, injected last. Sanitised on write and served from a
     * stylesheet route rather than inline, so it is covered by CSP.
     */
    customCss: text('custom_css'),

    isDefault: boolean('is_default').notNull().default(false),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // At most one default theme.
    uniqueIndex('themes_single_default_key')
      .on(t.isDefault)
      .where(sql`${t.isDefault}`),
  ],
)

/**
 * Transactional outbox (F06).
 *
 * Events are inserted **in the same transaction as the state change** that
 * produced them. That is the entire reason this table exists: a rolled-back
 * transaction takes its events with it, satisfying F06's acceptance criterion
 * that "an event written in a rolled-back transaction is never delivered".
 * Publishing to a queue directly cannot offer that, because the queue does not
 * participate in the database transaction.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    /** Registered event name, e.g. 'post.created'. */
    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull(),

    /**
     * Correlation id copied from the request log context (F09), so a delivered
     * side effect can be traced back to the request that caused it.
     */
    correlationId: text('correlation_id'),

    /** Null until a drain picks it up. */
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    attempts: smallint('attempts').notNull().default(0),
    lastError: text('last_error'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // The drain claims the oldest undispatched rows.
    index('outbox_pending_idx')
      .on(t.id)
      .where(sql`${t.dispatchedAt} is null`),
  ],
)

/**
 * Job queue (F05/F06). Backed by Postgres so that a Vercel deployment needs no
 * extra infrastructure to be correct; the queue *driver* seam allows swapping
 * in a real broker without touching callers.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull().default({}),

    /** 'pending' | 'running' | 'succeeded' | 'failed' | 'dead' */
    status: text('status').notNull().default('pending'),

    /**
     * Deduplication key. A unique index over pending rows makes enqueueing
     * idempotent, which is what lets `/api/system/tick` be called twice
     * concurrently without doubling work (F06).
     */
    idempotencyKey: text('idempotency_key'),

    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    attempts: smallint('attempts').notNull().default(0),
    maxAttempts: smallint('max_attempts').notNull().default(5),

    /** Lease held by a worker; a crashed worker's lease simply expires. */
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lockedBy: text('locked_by'),

    lastError: text('last_error'),
    correlationId: text('correlation_id'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    /* R3.5, verbatim: jobs (status, run_at) WHERE status = 'pending'. */
    index('jobs_pending_idx')
      .on(t.status, t.runAt)
      .where(sql`${t.status} = 'pending'`),

    uniqueIndex('jobs_idempotency_key')
      .on(t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null and ${t.status} = 'pending'`),

    index('jobs_status_idx').on(t.status),
  ],
)

/**
 * Scheduled task registry (F07, R9).
 *
 * Tasks are **catch-up**, not cron: each row records when it last ran and how
 * often it should, and the tick endpoint runs whatever is overdue. A missed
 * window is therefore self-healing, which matters because serverless offers no
 * guarantee that any particular invocation happens.
 */
export const tasks = pgTable(
  'tasks',
  {
    /** Registered task key, e.g. 'expire-bans'. */
    key: text('key').primaryKey(),

    /** How often the task should run, in seconds. */
    intervalSeconds: integer('interval_seconds').notNull(),

    enabled: boolean('enabled').notNull().default(true),

    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    /** Denormalised `lastRunAt + interval`, so "what is overdue" is one index scan. */
    nextRunAt: timestamp('next_run_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Lease, preventing two concurrent ticks running the same task. */
    lockedUntil: timestamp('locked_until', { withTimezone: true }),

    consecutiveFailures: smallint('consecutive_failures').notNull().default(0),
  },
  (t) => [
    index('tasks_due_idx')
      .on(t.nextRunAt)
      .where(sql`${t.enabled}`),
  ],
)

/** Task execution history, for the ACP's health view. */
export const taskLog = pgTable(
  'task_log',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    taskKey: text('task_key').notNull(),
    succeeded: boolean('succeeded').notNull(),
    durationMs: integer('duration_ms'),
    /** Free-form summary, e.g. "expired 3 bans". */
    detail: text('detail'),
    error: text('error'),
    ranAt: timestamp('ran_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('task_log_key_ran_idx').on(t.taskKey, t.ranAt.desc())],
)

/**
 * Cache generation counters (F10/F20).
 *
 * Some invalidations are too broad to enumerate as tags — "any permission
 * anywhere changed" must invalidate every resolved Actor. Bumping a counter
 * here and including it in the cache key retires every old entry at once,
 * which is F20's `permission_version`.
 */
export const cacheVersions = pgTable('cache_versions', {
  key: text('key').primaryKey(),
  version: integer('version').notNull().default(1),
  bumpedAt: timestamp('bumped_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/**
 * Administrative audit log. R4.2 requires admin and super-moderator permission
 * bypasses be logged; this is where they land, alongside ACP mutations.
 */
export const adminLog = pgTable(
  'admin_log',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    userId: integer('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** e.g. 'permission.bypass', 'settings.update'. */
    action: text('action').notNull(),
    /** Structured context: which action was bypassed, which forum, etc. */
    detail: jsonb('detail').notNull().default({}),
    ipPrefix: text('ip_prefix'),
    correlationId: text('correlation_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('admin_log_user_idx').on(t.userId, t.createdAt.desc()),
    index('admin_log_action_idx').on(t.action, t.createdAt.desc()),
  ],
)
