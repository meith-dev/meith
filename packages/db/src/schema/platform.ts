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
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import { usergroups, users } from './identity'

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

/**
 * Roll-up ledger (F38).
 *
 * Ancestor counters are deltas applied by an event handler, and the outbox
 * relay is at-least-once by design (F07) — a redelivered `post.created` would
 * add the same post to every ancestor a second time. Inserting the post id here
 * inside the same transaction as the update makes the roll-up idempotent
 * against replay: the insert either wins and the counters move, or it conflicts
 * and the handler does nothing.
 *
 * This is a ledger, not a queue: rows are never claimed or deleted, and it is
 * pruned only when its post is.
 */
export const contentCounterRollups = pgTable('content_counter_rollups', {
  postId: integer('post_id').primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Recount progress (F38).
 *
 * A recount over the target data volume (2M posts) cannot finish inside one
 * serverless invocation, so it runs as a bounded batch per tick and stores
 * where it got to. `phase` is which counter family is being rebuilt and
 * `cursor` the last id completed within it; together they are the resume point.
 *
 * Keyed rather than a single implicit row so F70's on-demand "Recount &
 * Rebuild" can track its own scan without racing the scheduled one.
 */
export const counterRecountState = pgTable('counter_recount_state', {
  id: text('id').primaryKey(),
  /** 'threads' | 'forums' | 'users' — see the recount's phase order. */
  phase: text('phase').notNull().default('threads'),
  cursor: integer('cursor').notNull().default(0),
  /** Completed sweeps of all three phases. Operator visibility only. */
  passes: integer('passes').notNull().default(0),
  /** Rows corrected across all runs. A steadily rising number means drift. */
  corrected: integer('corrected').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * Mass mail (F67).
 *
 * A row per *campaign*, not per recipient. The body is stored once and the
 * queued jobs carry `{ massMailId, userId }`, because a payload holding the
 * body would put a copy of it in the queue for every member on the board — on
 * a board with twenty thousand members that is the same text twenty thousand
 * times, in the table the worker scans.
 *
 * `lastUserId` is the resume point. Sending is chunked and keyset-paged like
 * every other bulk operation in the panel, so a run that stops half way can be
 * continued rather than restarted — and restarting a mass mail is not a neutral
 * act, it is mailing everybody twice.
 */
export const massMails = pgTable('mass_mails', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  /** Null targets every eligible member; otherwise one group. */
  targetGroupId: integer('target_group_id').references(() => usergroups.id, {
    onDelete: 'set null',
  }),
  /** Keyset cursor: the last member queued. */
  lastUserId: integer('last_user_id').notNull().default(0),
  /** How many jobs have been enqueued so far. */
  queuedCount: integer('queued_count').notNull().default(0),
  /** 'sending' | 'finished' */
  status: text('status').notNull().default('sending'),
  createdByUserId: integer('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
})

/**
 * Stored searches (F73).
 *
 * A search is a row so that paging, sorting and "search within results" refer
 * to something the board already knows rather than to a query string carrying
 * every filter. It holds the **query**, not a frozen list of hits — see
 * `search-store.ts` for why that distinction is the whole design.
 *
 * `created_at` is also the flood-control clock: the newest row for a member is
 * when they last searched, so no second table is needed to rate-limit them.
 */
export const searches = pgTable(
  'searches',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    /** Unguessable, because it appears in a URL a member can bookmark. */
    token: text('token').notNull(),
    /** Null for a guest, whose searches are stored against their session. */
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /**
     * A *hash* of the guest's session token, never the token itself.
     *
     * Guests need this for two things — paging their own results, and being
     * rate-limited individually rather than as one shared bucket — and both
     * work on an opaque key. Storing the token would put a live credential in a
     * table that exists to be pruned and read by operators.
     */
    sessionKey: text('session_key'),
    terms: text('terms').notNull(),
    /** The rest of the query — authors, forums, dates, sort — as submitted. */
    filters: jsonb('filters').notNull().default({}),
    /** What the search found when it was run, for the "N results" line. */
    hitCount: integer('hit_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('searches_token_key').on(t.token),
    /* The flood check and the "my recent searches" list both read this. */
    index('searches_user_recent_idx').on(t.userId, t.createdAt),
    index('searches_session_recent_idx').on(t.sessionKey, t.createdAt),
  ],
)

/**
 * The board's statistics, and the online record (F75).
 *
 * **One row, enforced by the primary key.** `id` is a `smallint` that is always
 * 1 and a check constraint says so, which turns "there is exactly one row of
 * board statistics" into something the database holds rather than something
 * every reader hopes for. The alternative — a key/value table — makes reading
 * six numbers six rows and makes an atomic update of all six impossible.
 *
 * The totals are a **rollup**, recomputed by a task rather than incremented on
 * every post. F38's counters already do the incremental work per forum and per
 * user; summing them on demand is a scan of the forum table, which is tens of
 * rows, but `member_count` is a count of `users` and that one is not free on a
 * board with two hundred thousand accounts. So the numbers here are as fresh as
 * the last run and the page says when that was — a number that is ten minutes
 * old and honest beats one that is exact and costs a full scan per page view.
 *
 * `most_online_*` is different in kind: it is a **record**, not a rollup, and it
 * is written the moment it is beaten by a conditional UPDATE whose `where` is
 * the comparison. A read-then-write would lose the higher of two simultaneous
 * peaks, which is the only interesting case.
 */
export const boardStats = pgTable(
  'board_stats',
  {
    /** Always 1. The check constraint below is what makes that true. */
    id: smallint('id').primaryKey().default(1),

    threadCount: integer('thread_count').notNull().default(0),
    postCount: integer('post_count').notNull().default(0),
    memberCount: integer('member_count').notNull().default(0),

    /** The most recently registered active account, for the index panel. */
    newestUserId: integer('newest_user_id'),
    newestUsername: text('newest_username'),

    /** The peak concurrent visitor count, and when it happened. */
    mostOnlineCount: integer('most_online_count').notNull().default(0),
    mostOnlineAt: timestamp('most_online_at', { withTimezone: true }),

    /** When the rollup last ran. The page shows it rather than implying "now". */
    computedAt: timestamp('computed_at', { withTimezone: true }),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('board_stats_singleton', sql`${t.id} = 1`)],
)
