/**
 * R3.2 Community tree: `communities`, `community_permissions`, `community_moderators`,
 * `communities_read`, `community_subscriptions`, `community_password_grants`.
 *
 * The tree is stored with a **materialised path** rather than a recursive CTE
 * per read, because F16 requires "tree read is one query regardless of depth"
 * and F21 requires the ancestor walk for permission inheritance to be cheap.
 *
 * `path` holds dot-separated ancestor ids, root first, including the row itself:
 *
 *     Category (id 1)                 path = '1'
 *       Community (id 4)                  path = '1.4'
 *         Subcommunity (id 9)             path = '1.4.9'
 *           Sub-subcommunity (id 12)      path = '1.4.9.12'
 *
 * That makes "this community and all descendants" a prefix match, and "my
 * ancestors" a parse of my own path with no query at all — which is what F21's
 * one-query `visibleCommunityIds` depends on. The cost is that reparenting must
 * rewrite every descendant's path in one transaction (F16's explicit warning).
 */

import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

import { communityPermissionColumns } from './permission-columns'
import { usergroups, users } from './identity'

/**
 * `category` — a container; holds no threads, renders as a block on the index.
 * `community`    — holds threads, may hold subcommunities.
 * `link`     — renders as a row but navigates elsewhere; has no content.
 */
export const COMMUNITY_TYPES = ['category', 'community', 'link'] as const

export const communities = pgTable(
  'communities',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    type: text('type').notNull().default('community'),

    title: text('title').notNull(),
    description: text('description'),
    /** URL slug, unique per parent so sibling titles cannot collide. */
    slug: text('slug').notNull(),

    parentId: integer('parent_id'),

    /**
     * Materialised ancestor path, dot-separated, inclusive of self.
     * Maintained transactionally by the move/reorder operations in F16.
     */
    path: text('path').notNull(),
    /** Depth, derived from path. Stored to avoid counting dots in SQL. */
    depth: integer('depth').notNull().default(0),

    displayOrder: integer('display_order').notNull().default(0),

    /** For type='link'. */
    linkUrl: text('link_url'),
    /** Redirect hit counter for link-type rows. */
    linkHits: integer('link_hits').notNull().default(0),

    /* ---- Per-community posting toggles (R3.2) ---- */
    isOpen: boolean('is_open').notNull().default(true),
    allowThreads: boolean('allow_threads').notNull().default(true),
    allowReplies: boolean('allow_replies').notNull().default(true),
    allowPolls: boolean('allow_polls').notNull().default(true),
    allowAttachments: boolean('allow_attachments').notNull().default(true),
    /** Threads default to this prefix requirement; enforced in F31. */
    requiresPrefix: boolean('requires_prefix').notNull().default(false),

    /* ---- Moderation flags (R3.2) ---- */
    moderateNewThreads: boolean('moderate_new_threads').notNull().default(false),
    moderateNewPosts: boolean('moderate_new_posts').notNull().default(false),

    /**
     * Password-protected communities. Argon2id hash of the community password; access is
     * granted per-session via `community_password_grants` rather than by keeping the
     * cleartext password in a cookie.
     */
    passwordHash: text('password_hash'),

    /**
     * Counter columns. F16 creates them deliberately *unmaintained*; the outbox
     * consumers in Phase 3 begin updating them. They are not authoritative
     * until then, and nothing in Phase 2 reads them for correctness.
     */
    threadCount: integer('thread_count').notNull().default(0),
    postCount: integer('post_count').notNull().default(0),

    /** Denormalised last-post pointer, for the index page's last-post column. */
    lastPostId: integer('last_post_id'),
    lastPostThreadId: integer('last_post_thread_id'),
    lastPostThreadTitle: text('last_post_thread_title'),
    lastPostUserId: integer('last_post_user_id'),
    lastPostUsername: text('last_post_username'),
    lastPostAt: timestamp('last_post_at', { withTimezone: true }),

    /** Provenance for the MyBB importer. */
    legacyMybbFid: integer('legacy_mybb_fid'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Sibling slugs must be unique; the same slug may recur under a different
    // parent. Two indexes because NULL parent (roots) needs its own uniqueness.
    uniqueIndex('communities_parent_slug_key')
      .on(t.parentId, t.slug)
      .where(sql`${t.parentId} is not null`),
    uniqueIndex('communities_root_slug_key')
      .on(t.slug)
      .where(sql`${t.parentId} is null`),

    index('communities_parent_order_idx').on(t.parentId, t.displayOrder),
    // Prefix scans for "this subtree": WHERE path LIKE '1.4.%'.
    index('communities_path_idx').on(t.path),
    uniqueIndex('communities_legacy_mybb_fid_key')
      .on(t.legacyMybbFid)
      .where(sql`${t.legacyMybbFid} is not null`),
  ],
)

/**
 * R4.1 layer 2 — the usergroup × community matrix, "the heart of the product".
 *
 * Every permission column is NULLABLE and NULL means **inherit**: resolution
 * walks the ancestor chain, takes the first non-NULL value, and falls back to
 * the group default from `usergroups`. A row existing here does not mean the
 * community overrides everything — only the columns that are non-NULL.
 */
export const communityPermissions = pgTable(
  'community_permissions',
  {
    communityId: integer('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    groupId: integer('group_id')
      .notNull()
      .references(() => usergroups.id, { onDelete: 'cascade' }),

    /** Community-scoped permission fields only, all nullable. */
    ...communityPermissionColumns(),

    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('community_permissions_pkey').on(t.communityId, t.groupId),
    // The resolver loads every override for the actor's groups in one query.
    index('community_permissions_group_idx').on(t.groupId),
  ],
)

/**
 * R4.1 layer 3 — moderators, per user *or* per group, with granular rights and
 * an optional cascade to subcommunities.
 *
 * Exactly one of `userId` / `groupId` is set; a CHECK constraint enforces that
 * in the migration. Modelling both in one table keeps the resolver to a single
 * query instead of a union of two.
 */
export const communityModerators = pgTable(
  'community_moderators',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),

    communityId: integer('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),

    userId: integer('user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    groupId: integer('group_id').references(() => usergroups.id, {
      onDelete: 'cascade',
    }),

    /** When true the rights apply to every descendant community as well. */
    cascadeToSubcommunities: boolean('cascade_to_subcommunities')
      .notNull()
      .default(false),

    /* Granular moderator rights. Deliberately explicit rather than a bitmask:
     * a bitmask saves bytes nobody is short of and makes every ACP screen and
     * every test read as magic numbers. */
    canEditPosts: boolean('can_edit_posts').notNull().default(false),
    canSoftDeletePosts: boolean('can_soft_delete_posts')
      .notNull()
      .default(false),
    canRestorePosts: boolean('can_restore_posts').notNull().default(false),
    canHardDeletePosts: boolean('can_hard_delete_posts')
      .notNull()
      .default(false),
    canApproveContent: boolean('can_approve_content').notNull().default(false),
    canOpenCloseThreads: boolean('can_open_close_threads')
      .notNull()
      .default(false),
    canStickThreads: boolean('can_stick_threads').notNull().default(false),
    canMoveThreads: boolean('can_move_threads').notNull().default(false),
    canMergeThreads: boolean('can_merge_threads').notNull().default(false),
    canSplitThreads: boolean('can_split_threads').notNull().default(false),
    canManagePolls: boolean('can_manage_polls').notNull().default(false),
    canViewIps: boolean('can_view_ips').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('community_moderators_user_key')
      .on(t.communityId, t.userId)
      .where(sql`${t.userId} is not null`),
    uniqueIndex('community_moderators_group_key')
      .on(t.communityId, t.groupId)
      .where(sql`${t.groupId} is not null`),
    index('community_moderators_user_idx').on(t.userId),
    index('community_moderators_group_idx').on(t.groupId),
  ],
)

/**
 * Per-session grants for password-protected communities.
 *
 * Scoped to a session, not a user, so the grant dies with the session and is
 * not silently inherited by a "remember me" login on another device.
 */
export const communityPasswordGrants = pgTable(
  'community_password_grants',
  {
    sessionId: integer('session_id').notNull(),
    communityId: integer('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    grantedAt: timestamp('granted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex('community_password_grants_pkey').on(t.sessionId, t.communityId)],
)

/**
 * Community-level read marker (F35). Holds the "everything before this instant is
 * read" watermark, so marking a busy community read is one row, not one row per
 * thread.
 */
export const communitiesRead = pgTable(
  'communities_read',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    communityId: integer('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('communities_read_pkey').on(t.userId, t.communityId)],
)

/**
 * Community subscriptions. Thread subscriptions live in the content schema.
 *
 * Like that table, this one has existed since `0000` and had no reader until
 * F56 — and like that table, its `notify_via` *channel* became a `mode`
 * cadence, because F55 answered the channel question board-wide and a
 * per-subscription second answer would disagree with it (migration `0008`).
 */
export const communitySubscriptions = pgTable(
  'community_subscriptions',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    communityId: integer('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /** 'none' | 'instant' | 'daily' | 'weekly' — a cadence, not a channel. */
    mode: text('mode').notNull().default('instant'),
    /** The last post this subscriber was told about. See `threadSubscriptions`. */
    lastNotifiedPostId: integer('last_notified_post_id').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('community_subscriptions_pkey').on(t.userId, t.communityId),
    index('community_subscriptions_community_idx').on(t.communityId),
    index('community_subscriptions_user_idx').on(t.userId, t.createdAt.desc()),
    index('community_subscriptions_mode_idx').on(t.mode, t.userId),
  ],
)
