import { sql } from 'drizzle-orm'
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { usergroups, users } from './identity'
import { forumPermissionColumns } from './permission-columns'

export const FORUM_TYPES = ['category', 'forum', 'link'] as const

export const forums = pgTable(
  'forums',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    type: text('type').notNull().default('forum'),

    title: text('title').notNull(),
    description: text('description'),
    slug: text('slug').notNull(),

    parentId: integer('parent_id'),

    path: text('path').notNull(),
    depth: integer('depth').notNull().default(0),

    displayOrder: integer('display_order').notNull().default(0),

    linkUrl: text('link_url'),
    linkHits: integer('link_hits').notNull().default(0),

    isOpen: boolean('is_open').notNull().default(true),
    allowThreads: boolean('allow_threads').notNull().default(true),
    allowReplies: boolean('allow_replies').notNull().default(true),
    allowPolls: boolean('allow_polls').notNull().default(true),
    allowAttachments: boolean('allow_attachments').notNull().default(true),
    requiresPrefix: boolean('requires_prefix').notNull().default(false),

    moderateNewThreads: boolean('moderate_new_threads').notNull().default(false),
    moderateNewPosts: boolean('moderate_new_posts').notNull().default(false),

    passwordHash: text('password_hash'),

    threadCount: integer('thread_count').notNull().default(0),
    postCount: integer('post_count').notNull().default(0),

    lastPostId: integer('last_post_id'),
    lastPostThreadId: integer('last_post_thread_id'),
    lastPostThreadTitle: text('last_post_thread_title'),
    lastPostUserId: integer('last_post_user_id'),
    lastPostUsername: text('last_post_username'),
    lastPostAt: timestamp('last_post_at', { withTimezone: true }),

    legacyId: integer('legacy_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('forums_parent_slug_key')
      .on(t.parentId, t.slug)
      .where(sql`${t.parentId} is not null`),
    uniqueIndex('forums_root_slug_key').on(t.slug).where(sql`${t.parentId} is null`),

    index('forums_parent_order_idx').on(t.parentId, t.displayOrder),
    index('forums_path_idx').on(t.path),
    uniqueIndex('forums_legacy_id_key').on(t.legacyId).where(sql`${t.legacyId} is not null`),
  ],
)

export const forumPermissions = pgTable(
  'forum_permissions',
  {
    forumId: integer('forum_id')
      .notNull()
      .references(() => forums.id, { onDelete: 'cascade' }),
    groupId: integer('group_id')
      .notNull()
      .references(() => usergroups.id, { onDelete: 'cascade' }),

    ...forumPermissionColumns(),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('forum_permissions_pkey').on(t.forumId, t.groupId),
    index('forum_permissions_group_idx').on(t.groupId),
  ],
)

export const forumModerators = pgTable(
  'forum_moderators',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    forumId: integer('forum_id')
      .notNull()
      .references(() => forums.id, { onDelete: 'cascade' }),

    userId: integer('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    groupId: integer('group_id').references(() => usergroups.id, {
      onDelete: 'cascade',
    }),

    cascadeToSubforums: boolean('cascade_to_subforums').notNull().default(false),

    canEditPosts: boolean('can_edit_posts').notNull().default(false),
    canSoftDeletePosts: boolean('can_soft_delete_posts').notNull().default(false),
    canRestorePosts: boolean('can_restore_posts').notNull().default(false),
    canApproveContent: boolean('can_approve_content').notNull().default(false),
    canOpenCloseThreads: boolean('can_open_close_threads').notNull().default(false),
    canStickThreads: boolean('can_stick_threads').notNull().default(false),
    canMoveThreads: boolean('can_move_threads').notNull().default(false),
    canMergeThreads: boolean('can_merge_threads').notNull().default(false),
    canSplitThreads: boolean('can_split_threads').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('forum_moderators_user_key')
      .on(t.forumId, t.userId)
      .where(sql`${t.userId} is not null`),
    uniqueIndex('forum_moderators_group_key')
      .on(t.forumId, t.groupId)
      .where(sql`${t.groupId} is not null`),
    index('forum_moderators_user_idx').on(t.userId),
    index('forum_moderators_group_idx').on(t.groupId),
  ],
)

export const forumsRead = pgTable(
  'forums_read',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    forumId: integer('forum_id')
      .notNull()
      .references(() => forums.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('forums_read_pkey').on(t.userId, t.forumId)],
)

export const forumSubscriptions = pgTable(
  'forum_subscriptions',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    forumId: integer('forum_id')
      .notNull()
      .references(() => forums.id, { onDelete: 'cascade' }),
    mode: text('mode').notNull().default('instant'),
    lastNotifiedPostId: integer('last_notified_post_id').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('forum_subscriptions_pkey').on(t.userId, t.forumId),
    index('forum_subscriptions_forum_idx').on(t.forumId),
    index('forum_subscriptions_user_idx').on(t.userId, t.createdAt.desc()),
    index('forum_subscriptions_mode_idx').on(t.mode, t.userId),
  ],
)
