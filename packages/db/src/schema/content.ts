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

import { users } from './identity'
import { forums } from './structure'

export const VISIBILITY = ['visible', 'unapproved', 'deleted'] as const
export type Visibility = (typeof VISIBILITY)[number]

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector'
  },
})

export const threadPrefixes = pgTable(
  'thread_prefixes',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    label: text('label').notNull(),
    token: text('token'),
    displayOrder: integer('display_order').notNull().default(0),
    forumPathPrefix: text('forum_path_prefix'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
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

    authorUserId: integer('author_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    authorUsername: text('author_username').notNull(),

    visibility: text('visibility').notNull().default('visible'),

    isSticky: boolean('is_sticky').notNull().default(false),
    isLocked: boolean('is_locked').notNull().default(false),

    firstPostId: integer('first_post_id'),

    replyCount: integer('reply_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    ratingTotal: integer('rating_total').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),

    lastPostId: integer('last_post_id'),
    lastPostUserId: integer('last_post_user_id'),
    lastPostUsername: text('last_post_username'),
    lastPostAt: timestamp('last_post_at', { withTimezone: true }).notNull().defaultNow(),

    movedToThreadId: integer('moved_to_thread_id'),

    legacyMybbTid: integer('legacy_mybb_tid'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('threads_forum_listing_idx')
      .on(t.forumId, t.isSticky.desc(), t.lastPostAt.desc())
      .where(sql`${t.visibility} = 'visible'`),

    index('threads_forum_listing_all_idx').on(t.forumId, t.isSticky.desc(), t.lastPostAt.desc()),

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
    forumId: integer('forum_id')
      .notNull()
      .references(() => forums.id, { onDelete: 'cascade' }),

    authorUserId: integer('author_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    authorUsername: text('author_username').notNull(),

    subject: text('subject'),
    message: text('message').notNull(),

    bodyFormat: smallint('body_format').notNull().default(1),

    messageHtml: text('message_html'),
    renderVersion: smallint('render_version').notNull().default(0),
    vocabVersion: smallint('vocab_version').notNull().default(0),

    visibility: text('visibility').notNull().default('visible'),

    isFirstPost: boolean('is_first_post').notNull().default(false),

    ipPrefix: text('ip_prefix'),

    editedAt: timestamp('edited_at', { withTimezone: true }),
    editedByUserId: integer('edited_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    editReason: text('edit_reason'),
    revisionCount: smallint('revision_count').notNull().default(0),

    searchVector: tsvector('search_vector'),
    searchVersion: smallint('search_version').notNull().default(1),

    legacyMybbPid: integer('legacy_mybb_pid'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('posts_thread_visible_idx').on(t.threadId, t.id).where(sql`${t.visibility} = 'visible'`),

    index('posts_thread_all_idx').on(t.threadId, t.id),

    index('posts_author_idx').on(t.authorUserId, t.createdAt.desc()),

    index('posts_render_version_idx').on(t.renderVersion, t.id),
    index('posts_vocab_version_idx').on(t.vocabVersion, t.id),
    index('posts_search_version_idx').on(t.searchVersion, t.id),
    index('posts_forum_visibility_idx')
      .on(t.forumId, t.createdAt.desc())
      .where(sql`${t.visibility} <> 'visible'`),

    uniqueIndex('posts_legacy_mybb_pid_key')
      .on(t.legacyMybbPid)
      .where(sql`${t.legacyMybbPid} is not null`),

    index('posts_search_vector_idx').using('gin', t.searchVector),
  ],
)

export const postRevisions = pgTable(
  'post_revisions',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    revision: smallint('revision').notNull(),
    message: text('message').notNull(),
    subject: text('subject'),
    editedByUserId: integer('edited_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    editReason: text('edit_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('post_revisions_post_revision_key').on(t.postId, t.revision)],
)

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
    index('threads_read_read_at_idx').on(t.readAt),
  ],
)

export const threadViewBuffer = pgTable(
  'thread_view_buffer',
  {
    threadId: integer('thread_id')
      .primaryKey()
      .references(() => threads.id, { onDelete: 'cascade' }),
    pending: integer('pending').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('thread_view_buffer_updated_idx').on(t.updatedAt)],
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
    mode: text('mode').notNull().default('instant'),
    lastNotifiedPostId: integer('last_notified_post_id').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('thread_subscriptions_pkey').on(t.userId, t.threadId),
    index('thread_subscriptions_thread_idx').on(t.threadId),
    index('thread_subscriptions_user_idx').on(t.userId, t.createdAt.desc()),
    index('thread_subscriptions_mode_idx').on(t.mode, t.userId),
  ],
)

export const digestRuns = pgTable(
  'digest_runs',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cadence: text('cadence').notNull(),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ name: 'digest_runs_pkey', columns: [t.userId, t.cadence] })],
)

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

    forumId: integer('forum_id').references(() => forums.id, {
      onDelete: 'set null',
    }),
    threadId: integer('thread_id').references(() => threads.id, {
      onDelete: 'set null',
    }),
    targetLabel: text('target_label').notNull().default(''),

    reporterUserId: integer('reporter_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reason: text('reason').notNull(),

    status: text('status').notNull().default('open'),
    assignedToUserId: integer('assigned_to_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    resolvedByUserId: integer('resolved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reports_open_idx').on(t.forumId, t.createdAt).where(sql`${t.status} = 'open'`),
    index('reports_open_global_idx')
      .on(t.createdAt)
      .where(sql`${t.status} = 'open' and ${t.forumId} is null`),
    uniqueIndex('reports_one_open_per_reporter_key')
      .on(t.reporterUserId, t.targetKind, t.targetId)
      .where(sql`${t.status} = 'open' and ${t.reporterUserId} is not null`),
  ],
)

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
    kind: text('kind').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('report_events_report_idx').on(t.reportId, t.createdAt)],
)

export const reputation = pgTable(
  'reputation',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    givenByUserId: integer('given_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    postId: integer('post_id').references(() => posts.id, {
      onDelete: 'cascade',
    }),
    points: smallint('points').notNull().default(1),
    comment: text('comment').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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

export const attachments = pgTable(
  'attachments',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    // Null between upload and being claimed by a post — a member can only place
    // [attachment=id] for one they can already name, so the id has to exist
    // before the post that names it does (see attachment-embed.ts). An orphan
    // past its grace period is swept the same way an abandoned storage key is.
    postId: integer('post_id').references(() => posts.id, { onDelete: 'cascade' }),
    forumId: integer('forum_id')
      .notNull()
      .references(() => forums.id, { onDelete: 'cascade' }),
    uploaderUserId: integer('uploader_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    storageKey: text('storage_key'),
    sourceKey: text('source_key'),
    thumbnailKey: text('thumbnail_key'),
    width: integer('width'),
    height: integer('height'),
    status: text('status').notNull().default('pending'),
    failureReason: text('failure_reason'),
    downloadCount: integer('download_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
  },
  (t) => [
    index('attachments_post_idx').on(t.postId),
    index('attachments_uploader_idx').on(t.uploaderUserId),
    index('attachments_pending_idx').on(t.createdAt).where(sql`${t.status} = 'pending'`),
    index('attachments_orphan_idx').on(t.createdAt).where(sql`${t.postId} is null`),
    uniqueIndex('attachments_storage_key_key')
      .on(t.storageKey)
      .where(sql`${t.storageKey} is not null`),
    uniqueIndex('attachments_source_key_key')
      .on(t.sourceKey)
      .where(sql`${t.sourceKey} is not null`),
  ],
)

export const attachmentOrphans = pgTable(
  'attachment_orphans',
  {
    storageKey: text('storage_key').primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('attachment_orphans_age_idx').on(t.createdAt)],
)

export const wordFilters = pgTable('word_filters', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  pattern: text('pattern').notNull(),
  replacement: text('replacement').notNull().default(''),
  wholeWord: boolean('whole_word').notNull().default(true),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const smilies = pgTable(
  'smilies',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    code: text('code').notNull(),
    src: text('src').notNull(),
    alt: text('alt'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('smilies_code_key').on(t.code)],
)

export const customDirectives = pgTable(
  'custom_directives',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    name: text('name').notNull(),
    block: boolean('block').notNull().default(false),
    description: text('description'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('custom_directives_name_key').on(t.name)],
)

export const announcements = pgTable(
  'announcements',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    forumId: integer('forum_id').references(() => forums.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    message: text('message').notNull(),
    bodyFormat: smallint('body_format').notNull().default(1),
    authorUserId: integer('author_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    authorUsername: text('author_username').notNull().default(''),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('announcements_live_idx').on(t.startsAt.desc()).where(sql`${t.enabled}`),
    index('announcements_forum_idx').on(t.forumId),
  ],
)
