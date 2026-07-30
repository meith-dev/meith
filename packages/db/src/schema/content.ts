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
    /** Raw BBCode as typed. Rendering happens at read time (F28). */
    message: text('message').notNull(),

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
     * Generated full-text column (R3.5). Written by Postgres, never by the app:
     * declared `GENERATED ALWAYS AS ... STORED` in the migration with subject
     * weighted A and message weighted B, so a title match outranks a body match.
     */
    searchVector: tsvector('search_vector'),

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
  (t) => [uniqueIndex('post_revisions_post_revision_key').on(t.postId, t.revision)],
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

export const threadSubscriptions = pgTable(
  'thread_subscriptions',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    threadId: integer('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    /** 'none' | 'email' | 'notification' */
    notifyVia: text('notify_via').notNull().default('notification'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('thread_subscriptions_pkey').on(t.userId, t.threadId),
    // Fan-out on a new reply reads every subscriber of one thread.
    index('thread_subscriptions_thread_idx').on(t.threadId),
  ],
)
