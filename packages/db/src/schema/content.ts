/**
 * R3.3 Content: `thread_prefixes`, `threads`, `posts`, `post_revisions`,
 * `threads_read`, `thread_subscriptions`.
 *
 * The tables Phase 2 must read are complete here. Attachments, polls, ratings
 * and drafts arrive with their features in Phase 3+ and are intentionally
 * absent rather than stubbed — an empty table invites code that pretends to
 * support a feature that does not exist.
 *
 * `visibility` is `visible | unapproved | deleted` on both `threads` and
 * `posts` (R3.3). It is the single most important column in the schema: every
 * listing query filters on it, and every one of the R3.5 partial indexes exists
 * because of it.
 */

import { sql } from 'drizzle-orm'
import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import { forums } from './structure'
import { users } from './identity'

/** R3.3: the three-state visibility used by threads and posts. */
export const VISIBILITY = ['visible', 'unapproved', 'deleted'] as const
export type Visibility = (typeof VISIBILITY)[number]

/**
 * `tsvector`, which drizzle has no first-class column type for. Declared as a
 * generated column in the migration; here it is read-only so queries can
 * reference it without drizzle attempting to write it.
 */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector'
  },
})

/** Thread prefixes (F31). Presentation-only labels with optional group gating. */
export const threadPrefixes = pgTable(
  'thread_prefixes',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    label: text('label').notNull(),
    /** R7 token name, never a colour literal. */
    token: text('token'),
    displayOrder: integer('display_order').notNull().default(0),
    /**
     * Null = usable in every forum. Otherwise a dot-path prefix restricting the
     * prefix to one subtree, matching `forums.path`.
     */
    forumPathPrefix: text('forum_path_prefix'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('thread_prefixes_order_idx').on(t.displayOrder)],
)

export const threads = pgTable(
  'threads',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    forumId: integer('forum_id')
      .notNull()
      .references(() => forums.id, { onDelete: 'cascade' }),

    title: text('title').notNull(),
    slug: text('slug').notNull(),

    prefixId: integer('prefix_id').references(() => threadPrefixes.id, {
      onDelete: 'set null',
    }),

    /**
     * Author. Nullable so a deleted account's threads survive; the denormalised
     * `authorUsername` preserves attribution for display.
     */
    authorUserId: integer('author_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    authorUsername: text('author_username').notNull(),

    visibility: text('visibility').notNull().default('visible'),

    isSticky: boolean('is_sticky').notNull().default(false),
    isLocked: boolean('is_locked').notNull().default(false),

    /**
     * The thread's opening post. Nullable only for the instant between inserting
     * the thread and its first post inside one transaction.
     */
    firstPostId: integer('first_post_id'),

    /** Denormalised for the listing; maintained with the thread's posts. */
    replyCount: integer('reply_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    /** F43's running aggregate, so the forum can order by ratings without a join. */
    ratingTotal: integer('rating_total').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),

    lastPostId: integer('last_post_id'),
    lastPostUserId: integer('last_post_user_id'),
    lastPostUsername: text('last_post_username'),
    /**
     * NOT NULL and defaulted: it is the primary listing sort key, and a NULL
     * here would sort unpredictably and defeat the R3.5 index.
     */
    lastPostAt: timestamp('last_post_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    /** Set when a thread is moved and a redirect stub is left behind. */
    movedToThreadId: integer('moved_to_thread_id'),

    legacyMybbTid: integer('legacy_mybb_tid'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    /*
     * R3.5, verbatim: threads (forum_id, is_sticky DESC, last_post_at DESC)
     * WHERE visibility = 'visible'. This is *the* index behind forum display.
     * Sticky descending puts pinned threads first; the partial predicate keeps
     * soft-deleted and unapproved rows out of the common path entirely.
     */
    index('threads_forum_listing_idx')
      .on(t.forumId, t.isSticky.desc(), t.lastPostAt.desc())
      .where(sql`${t.visibility} = 'visible'`),

    /*
     * R3.5 "unfiltered twin, for moderator views". A moderator seeing
     * unapproved and deleted content cannot use the partial index above, and
     * without this twin their forum view degrades to a sequential scan on the
     * largest table on the board.
     */
    index('threads_forum_listing_all_idx').on(
      t.forumId,
      t.isSticky.desc(),
      t.lastPostAt.desc(),
    ),

    index('threads_author_idx').on(t.authorUserId, t.createdAt.desc()),
    uniqueIndex('threads_legacy_mybb_tid_key')
      .on(t.legacyMybbTid)
      .where(sql`${t.legacyMybbTid} is not null`),
  ],
)

export const posts = pgTable(
  'posts',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    threadId: integer('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    /**
     * Denormalised from the thread. Carried on the post so that permission
     * filtering and moderation queues can scope by forum without joining
     * `threads` — at 2M posts that join is the difference between a fast query
     * and a slow one. Kept correct when a thread moves, in the same transaction.
     */
    forumId: integer('forum_id')
      .notNull()
      .references(() => forums.id, { onDelete: 'cascade' }),

    authorUserId: integer('author_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    authorUsername: text('author_username').notNull(),

    /** Optional per-post subject; most posts inherit the thread title. */
    subject: text('subject'),
    /** Raw Markdown as typed. The source of truth; the columns below cache it. */
    message: text('message').notNull(),

    /**
     * Which markup language `message` is written in (`BodyFormat`).
     *
     * `0` is BBCode and exists only for rows written before Markdown landed;
     * `1` is Markdown and is what every write path stores. The backfill
     * converts a legacy row's source once and stamps it `1`, so this column
     * counts down to a single value and then stays there. See
     * `migrations/0031_markdown.sql` for why the default is what it is.
     */
    bodyFormat: smallint('body_format').notNull().default(1),

    /**
     * `message` rendered by `@meith/markdown`, and the renderer version that did
     * it (F36).
     *
     * Null, or a version other than the current one, means "render it live" —
     * never an error and never a reason to hide a post. Bumping the renderer's
     * version constant therefore invalidates every stored render on the board
     * at once, which is what makes an escaping fix deployable without a
     * migration over the largest table there is. `posts.render_backfill`
     * rewrites the stale rows behind the read path.
     */
    messageHtml: text('message_html'),
    renderVersion: smallint('render_version').notNull().default(0),
    /**
     * Which board vocabulary produced `message_html` (F71).
     *
     * The second half of "which renderer made this". `render_version` covers
     * the *code*; this covers the smilies and directives an operator has
     * configured, which are equally part of what the renderer does — a smiley
     * is expanded from a text node and a directive changes how the source
     * parses, so both are baked in here rather than applied on the way out.
     *
     * Compared against `cache_versions['markdown_vocabulary']`. A mismatch means
     * the same thing a stale `render_version` does: render live, and let the
     * backfill rewrite it behind the read path. Never an error, and never a
     * reason to hide a post.
     */
    vocabVersion: smallint('vocab_version').notNull().default(0),

    visibility: text('visibility').notNull().default('visible'),

    /** True for the thread's opening post — cheaper than comparing ids. */
    isFirstPost: boolean('is_first_post').notNull().default(false),

    ipPrefix: text('ip_prefix'),

    editedAt: timestamp('edited_at', { withTimezone: true }),
    editedByUserId: integer('edited_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    editReason: text('edit_reason'),
    /** Number of stored revisions, so the UI can skip a count query. */
    revisionCount: smallint('revision_count').notNull().default(0),

    /**
     * The indexed document (F72). Subject weighted `A`, body weighted `B`, so a
     * title match outranks a passing mention.
     *
     * Written by the app rather than `GENERATED ALWAYS AS … STORED`, which is
     * the better design on an empty database and an outage on a live one:
     * adding a generated column rewrites the table under an exclusive lock. See
     * `search-repo.ts` for the whole of that argument.
     */
    searchVector: tsvector('search_vector'),
    /**
     * Which *definition* of the document produced `search_vector`.
     *
     * The same device as `render_version` beside it, for the same reason. What
     * belongs in the vector is a decision the code makes — it changed once
     * already, when the thread's title started being indexed for the opening
     * post — and a stored column cannot notice that the rule moved underneath
     * it. Bumping `SEARCH_DOCUMENT_VERSION` marks every row on the board as
     * needing a rebuild, and `search.reindex` does the rebuilding behind the
     * read path.
     *
     * The alternative was `invalidateIndex()`: null every vector and let the
     * backfill refill them. That works and it takes search away from the whole
     * board while it runs, which is the one thing a fix for search must not do.
     */
    searchVersion: smallint('search_version').notNull().default(0),

    legacyMybbPid: integer('legacy_mybb_pid'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    /*
     * R3.5, verbatim: posts (thread_id, id) WHERE visibility = 'visible'.
     * Thread view pages by post id within a thread; this index makes both the
     * page slice and the "which page is post N on" lookup index-only.
     */
    index('posts_thread_visible_idx')
      .on(t.threadId, t.id)
      .where(sql`${t.visibility} = 'visible'`),

    /* R3.5 unfiltered twin, for moderator views. */
    index('posts_thread_all_idx').on(t.threadId, t.id),

    index('posts_author_idx').on(t.authorUserId, t.createdAt.desc()),

    /*
     * F36's backfill: "the next N posts not at version X, by id". Version
     * first, so once the board is current the answer is an index seek that
     * finds nothing rather than a scan of every post to discover the same.
     */
    index('posts_render_version_idx').on(t.renderVersion, t.id),
    /*
     * Its twin, for the other half of the same question (F71). The backfill's
     * predicate is an OR across the two, so each side needs its own index or
     * the planner falls back to a sequential scan of the largest table here.
     */
    index('posts_vocab_version_idx').on(t.vocabVersion, t.id),
    /*
     * F72's backfill asks the same shape of question — "the next N posts not at
     * document version X, by id" — and needs its own index for the same reason:
     * once the board is current the answer has to be a seek that finds nothing,
     * not a scan of every post to discover the same.
     */
    index('posts_search_version_idx').on(t.searchVersion, t.id),
    // Moderation queue: unapproved content for a set of forums.
    index('posts_forum_visibility_idx')
      .on(t.forumId, t.createdAt.desc())
      .where(sql`${t.visibility} <> 'visible'`),

    uniqueIndex('posts_legacy_mybb_pid_key')
      .on(t.legacyMybbPid)
      .where(sql`${t.legacyMybbPid} is not null`),

    // R3.5: GIN over the generated tsvector.
    index('posts_search_vector_idx').using('gin', t.searchVector),
  ],
)

/**
 * Edit history (F29). Stores the *previous* body each time a post changes, so
 * the current text always lives on `posts` and reading a post never needs a
 * join into history.
 */
export const postRevisions = pgTable(
  'post_revisions',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    /** Monotonic per post, starting at 1. */
    revision: smallint('revision').notNull(),
    /** The body as it stood *before* this edit. */
    message: text('message').notNull(),
    subject: text('subject'),
    editedByUserId: integer('edited_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    editReason: text('edit_reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('post_revisions_post_revision_key').on(t.postId, t.revision),
  ],
)

/**
 * Per-thread read state (F35).
 *
 * Stores the last-read post id rather than a boolean, which is what makes
 * "jump to first unread" possible. Rows are pruned by a scheduled task against
 * the forum-level watermark in `forums_read`, so this table does not grow
 * without bound for users who read everything.
 */
export const threadsRead = pgTable(
  'threads_read',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: integer('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    lastReadPostId: integer('last_read_post_id'),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('threads_read_pkey').on(t.userId, t.threadId),
    // The pruning task scans by age.
    index('threads_read_read_at_idx').on(t.readAt),
  ],
)

/**
 * Buffered thread views (F38).
 *
 * Every thread page view is an increment here, and a scheduled task folds the
 * pending totals into `threads.view_count`. The indirection exists because
 * `threads` carries the listing index (R3.5): incrementing `view_count` in
 * place makes every view a write to the row the busiest read path sorts on, and
 * on a popular thread that is a stream of dead tuples behind the index for a
 * number nothing on the board depends on.
 */
export const threadViewBuffer = pgTable(
  'thread_view_buffer',
  {
    threadId: integer('thread_id')
      .primaryKey()
      .references(() => threads.id, { onDelete: 'cascade' }),
    /** Views recorded since the last flush. */
    pending: integer('pending').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('thread_view_buffer_updated_idx').on(t.updatedAt)],
)

/**
 * F28's table, given a reader by F56.
 *
 * `mode` was `notify_via` and held a *channel* ('none' | 'email' |
 * 'notification'). F55 answered the channel question board-wide — everything is
 * recorded on-site and `notification_preferences` decides what also goes by
 * e-mail — so what a subscription is left to say is *how often*: the MyBB
 * subscription type, renamed and remapped by migration `0008` rather than added
 * beside a column nothing reads.
 */
export const threadSubscriptions = pgTable(
  'thread_subscriptions',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: integer('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    /** 'none' | 'instant' | 'daily' | 'weekly' — a cadence, not a channel. */
    mode: text('mode').notNull().default('instant'),
    /**
     * The last post this subscriber was told about.
     *
     * A watermark rather than a queue of pending rows: "what is outstanding" is
     * then a range query, and a tick that never ran changes *when* somebody is
     * told rather than whether. Set on subscribe to the thread's current last
     * post, so following a 400-post thread notifies nobody about 400 posts.
     */
    lastNotifiedPostId: integer('last_notified_post_id').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('thread_subscriptions_pkey').on(t.userId, t.threadId),
    // Fan-out on a new reply reads every subscriber of one thread.
    index('thread_subscriptions_thread_idx').on(t.threadId),
    index('thread_subscriptions_user_idx').on(t.userId, t.createdAt.desc()),
    index('thread_subscriptions_mode_idx').on(t.mode, t.userId),
  ],
)

/**
 * When each member last received each cadence.
 *
 * Keyed by member *and* cadence, because a member can follow one thread daily
 * and another weekly. A task-wide clock would instead send everybody's digest
 * at whatever moment the tick fired, and hand somebody who subscribed on Sunday
 * a "weekly" digest on Monday.
 */
export const digestRuns = pgTable(
  'digest_runs',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cadence: text('cadence').notNull(),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'digest_runs_pkey', columns: [t.userId, t.cadence] }),
  ],
)

/**
 * F49 — reports.
 *
 * A report has a current state and a history, and they are separate tables
 * because collapsing them loses the second: "who assigned this to me, and
 * when" is the question a moderator picking up somebody else's work asks.
 */
export const REPORT_TARGET_KINDS = ['post', 'thread', 'user'] as const
export type ReportTargetKind = (typeof REPORT_TARGET_KINDS)[number]

export const REPORT_STATUSES = ['open', 'resolved', 'rejected'] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

export const reports = pgTable(
  'reports',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    targetKind: text('target_kind').notNull(),
    targetId: integer('target_id').notNull(),

    /**
     * Denormalised from the target, and null for a user report.
     *
     * This is what scopes the moderator list by `moderatedForumIds` without a
     * join per kind — and what keeps a report readable after its target is
     * hard-deleted.
     */
    forumId: integer('forum_id').references(() => forums.id, {
      onDelete: 'set null',
    }),
    threadId: integer('thread_id').references(() => threads.id, {
      onDelete: 'set null',
    }),
    /** Captured at report time: the target may be edited or removed afterwards. */
    targetLabel: text('target_label').notNull().default(''),

    reporterUserId: integer('reporter_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reason: text('reason').notNull(),

    /**
     * Assignment is a column, not a status. An assigned report is still open,
     * and modelling it as a state means "everything outstanding" has to ask for
     * two of them.
     */
    status: text('status').notNull().default('open'),
    assignedToUserId: integer('assigned_to_user_id').references(
      () => users.id,
      {
        onDelete: 'set null',
      },
    ),

    resolvedByUserId: integer('resolved_by_user_id').references(
      () => users.id,
      {
        onDelete: 'set null',
      },
    ),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('reports_open_idx')
      .on(t.forumId, t.createdAt)
      .where(sql`${t.status} = 'open'`),
    index('reports_open_global_idx')
      .on(t.createdAt)
      .where(sql`${t.status} = 'open' and ${t.forumId} is null`),
    /*
     * One open report per person per target. Without it, "report" is a button
     * that adds a queue row on every click — the cheapest denial-of-service on
     * the board. Partial, so the same person may report again once a previous
     * report is closed: circumstances change.
     */
    uniqueIndex('reports_one_open_per_reporter_key')
      .on(t.reporterUserId, t.targetKind, t.targetId)
      .where(sql`${t.status} = 'open' and ${t.reporterUserId} is not null`),
  ],
)

/** The history, and the only place a private moderator note lives. */
export const reportEvents = pgTable(
  'report_events',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    reportId: integer('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    actorUserId: integer('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** `opened | assigned | unassigned | resolved | rejected | note`. */
    kind: text('kind').notNull(),
    /** Never shown to the reporter. */
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('report_events_report_idx').on(t.reportId, t.createdAt)],
)

/**
 * Reputation (F62).
 *
 * One row per rating. Two uniqueness rules, both partial indexes rather than
 * checks: one profile rating per pair, and one rating per person per post — see
 * `migrations/0013_reputation.sql` for why the daily cap is *not* one of them.
 *
 * `users.reputation` is derived from these rows and recomputed from them, never
 * incremented, exactly as F53 handles `warning_points`.
 */
export const reputation = pgTable(
  'reputation',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Null once the giver's account is gone; the rating still counts. */
    givenByUserId: integer('given_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Null for a rating left on the profile rather than on a post. */
    /* The FK lives here rather than in identity.ts, which is why this table
       does: `posts` is declared in this file, and the schema files have a
       strict dependency order (identity <- structure <- content). */
    postId: integer('post_id').references(() => posts.id, {
      onDelete: 'cascade',
    }),
    points: smallint('points').notNull().default(1),
    comment: text('comment').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('reputation_profile_unique')
      .on(t.givenByUserId, t.userId)
      .where(sql`${t.postId} is null`),
    uniqueIndex('reputation_post_unique')
      .on(t.givenByUserId, t.postId)
      .where(sql`${t.postId} is not null`),
    index('reputation_user_idx').on(t.userId, t.id.desc()),
    index('reputation_given_idx').on(t.givenByUserId, t.createdAt.desc()),
  ],
)

/**
 * Attachments (F42).
 *
 * Two keys, and the difference between them is the feature. `sourceKey` is what
 * a member uploaded; `storageKey` is what the board serves, written by an
 * encoder from decoded pixels. A `pending` row has the first and not the
 * second, and nothing may be downloaded before that swaps — see
 * `migrations/0016_attachments.sql`.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    /** Denormalised: authorising a download must not need three joins. */
    forumId: integer('forum_id')
      .notNull()
      .references(() => forums.id, { onDelete: 'cascade' }),
    uploaderUserId: integer('uploader_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Sanitised, and display-only — it never reaches a path. */
    filename: text('filename').notNull(),
    /** The sniffed type, never the browser's claim. */
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key'),
    sourceKey: text('source_key'),
    thumbnailKey: text('thumbnail_key'),
    width: integer('width'),
    height: integer('height'),
    /** `pending | ready | failed`. */
    status: text('status').notNull().default('pending'),
    failureReason: text('failure_reason'),
    downloadCount: integer('download_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
  },
  (t) => [
    index('attachments_post_idx').on(t.postId),
    index('attachments_uploader_idx').on(t.uploaderUserId),
    index('attachments_pending_idx')
      .on(t.createdAt)
      .where(sql`${t.status} = 'pending'`),
    uniqueIndex('attachments_storage_key_key')
      .on(t.storageKey)
      .where(sql`${t.storageKey} is not null`),
    uniqueIndex('attachments_source_key_key')
      .on(t.sourceKey)
      .where(sql`${t.sourceKey} is not null`),
  ],
)

/**
 * Every object written to the file store, from the moment it is written.
 *
 * Inserted before the `put` and deleted when a row takes ownership of the key.
 * What remains is exactly the set of keys that may exist in the bucket with
 * nothing pointing at them — which is a cheap indexed question here and an
 * impossible one against a bucket.
 */
export const attachmentOrphans = pgTable(
  'attachment_orphans',
  {
    storageKey: text('storage_key').primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('attachment_orphans_age_idx').on(t.createdAt)],
)

/**
 * Word filters (F71).
 *
 * Applied when a post is *rendered*, never when it is saved — so the stored
 * text is untouched and a filter is reversible: turning one off restores the
 * word everywhere on the next render, a bad pattern can be corrected with no
 * lasting damage, and a filter added today applies to everything ever written.
 * Boards that rewrite on save have none of that, because the original is gone.
 *
 * The set is small by design and read on the render path, so it is cached and
 * compiled once per render rather than per post.
 */
export const wordFilters = pgTable('word_filters', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  /** Matched case-insensitively, and always as literal text. */
  pattern: text('pattern').notNull(),
  /** What readers see instead. May be empty, which removes the word. */
  replacement: text('replacement').notNull().default(''),
  /** Whole-word by default: see the Scunthorpe problem. */
  wholeWord: boolean('whole_word').notNull().default(true),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/**
 * The board's smilies (F71), over F37's already-safe primitive.
 *
 * A row is a **literal code and a source URL**, never a pattern: the code is
 * matched by `String#startsWith` at each position in a text node, so an
 * operator cannot type something that runs as a regular expression on every
 * post the board renders.
 *
 * Unlike a word filter, this is baked into the stored render — a smiley is
 * expanded from a text node while the document is being rendered — so editing
 * this table bumps `cache_versions['markdown_vocabulary']` and every stored
 * render on the board goes stale. See `posts.vocabVersion`.
 */
export const smilies = pgTable(
  'smilies',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    /** Literal source text such as `:)`. Longest match wins at render time. */
    code: text('code').notNull(),
    /** Put through the same image-URL policy as an inline image before it renders. */
    src: text('src').notNull(),
    /** Shown when the image cannot be. Defaults to the code itself. */
    alt: text('alt'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  /*
   * A duplicate code makes `compileSmilies` throw, which on the render path is
   * every thread page on the board. Refused at the source rather than caught.
   */
  (t) => [uniqueIndex('smilies_code_key').on(t.code)],
)

/**
 * Custom directives (F71), over F37's `createDirectiveRegistry`.
 *
 * The board's own additions to the markup language, spelled the way Markdown
 * spells an extension: `:::spoiler` … `:::` for a block, `:spoiler[…]` for a
 * span. Until this release they were custom BBCode tags; the table changed its
 * name in `0031_markdown.sql` and kept every column, because the safety
 * argument did not change.
 *
 * **The columns are that argument.** A directive chooses a name and whether it
 * is inline or block; there is no template, no replacement pattern, no renderer
 * and no HTML, because a field that chose output markup would be a second
 * markup language administered through a web form — which is how every board
 * with "custom MyCode" acquired a permanent XSS surface.
 */
export const customDirectives = pgTable(
  'custom_directives',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    /** 1–16 letters or digits, starting with a letter. Stored lower-cased. */
    name: text('name').notNull(),
    /** `div` when true, `span` when false. The only shape choice there is. */
    block: boolean('block').notNull().default(false),
    /** An operator's note. Never rendered anywhere a member can see. */
    description: text('description'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('custom_directives_name_key').on(t.name)],
)

/**
 * Announcements (F71).
 *
 * **Chrome, not content.** A sticky thread is a conversation: members reply to
 * it, it belongs to its author, and taking it down deletes what they said. An
 * announcement appears above the forums, cannot be replied to, expires on its
 * own date, and removing it removes nothing anybody wrote. Boards that build
 * announcements out of pinned threads keep a three-year-old rules post at the
 * top of every forum because deleting it would delete the discussion under it.
 *
 * There is no `message_html` and that is deliberate: the stored-render machinery
 * exists because a thread page renders fifty bodies out of a table with two
 * million rows. A board has a handful of announcements, so a cache here would
 * buy microseconds and cost a third staleness predicate and a third backfill —
 * including one for F71's own vocabulary.
 */
export const announcements = pgTable(
  'announcements',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    /**
     * `null` is board-wide.
     *
     * One column rather than a `scope` beside it, because two can disagree — a
     * row claiming to be forum-scoped with no forum is a state the reader would
     * have to invent a rule for.
     */
    forumId: integer('forum_id').references(() => forums.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** Markdown source. Rendered on read, with whatever vocabulary is current. */
    message: text('message').notNull(),
    /** `BodyFormat`; see `posts.bodyFormat`. Announcements have no stored render. */
    bodyFormat: smallint('body_format').notNull().default(1),
    authorUserId: integer('author_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Captured, so a deleted account's announcement still says who wrote it. */
    authorUsername: text('author_username').notNull().default(''),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    /** `null` never expires — "until further notice" is a real thing to want. */
    endsAt: timestamp('ends_at', { withTimezone: true }),
    /** Apart from the window, so redrafting one does not lose its schedule. */
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('announcements_live_idx').on(t.startsAt.desc()).where(sql`${t.enabled}`),
    index('announcements_forum_idx').on(t.forumId),
  ],
)
