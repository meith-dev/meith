/**
 * F16 forum-tree types.
 *
 * Deliberately structural: this package knows about shape and ordering, not
 * about Postgres and not about React. `@forum/db` implements the repository;
 * `apps/forum` maps nodes into a view model.
 */

/**
 * `category` — a container; holds no threads, renders as a block on the index.
 * `forum`    — holds threads, may hold subforums.
 * `link`     — renders as a row but navigates elsewhere; holds nothing.
 */
export const FORUM_TYPES = ['category', 'forum', 'link'] as const
export type ForumType = (typeof FORUM_TYPES)[number]

/**
 * The minimum a row needs for the tree to be assembled and ordered.
 *
 * `buildTree` is generic over this rather than over a fixed row type so later
 * features can widen what they select — F29's board index wants the last-post
 * columns, the ACP wants counters — without this package changing or every
 * caller casting.
 */
export interface TreeShaped {
  readonly id: number
  readonly parentId: number | null
  readonly displayOrder: number
}

/** The structural columns F16 itself reads. */
export interface ForumRow extends TreeShaped {
  readonly type: ForumType
  readonly title: string
  readonly slug: string
  readonly description: string | null
  readonly path: string
  readonly depth: number
  readonly linkUrl: string | null
}

/** A row with its children attached, ordered. */
export type ForumNode<T extends TreeShaped = ForumRow> = T & {
  readonly children: readonly ForumNode<T>[]
}

/** Everything needed to create a forum. `path`/`depth` are derived, never given. */
export interface NewForum {
  readonly type: ForumType
  readonly title: string
  readonly slug: string
  readonly description?: string | undefined
  /** `null` creates a top-level row. */
  readonly parentId: number | null
  /** Required for `type: 'link'`, meaningless otherwise. */
  readonly linkUrl?: string | undefined
  /** Omit to append after existing siblings. */
  readonly displayOrder?: number | undefined
}

/** Where a forum is being moved to, and where among its new siblings. */
export interface MoveTarget {
  /** `null` moves the forum to the top level. */
  readonly newParentId: number | null
  /**
   * Position among the new siblings, 0-based. Omit to append last. Values past
   * the end clamp rather than erroring — an ACP drag that lands past the final
   * row means "last", not "invalid".
   */
  readonly position?: number
}

/** One row's new coordinates, produced by `planMove` and applied by the repo. */
export interface PathUpdate {
  readonly id: number
  readonly path: string
  readonly depth: number
}

/** The complete, validated effect of a move. */
export interface MovePlan {
  readonly forumId: number
  readonly newParentId: number | null
  /** The moved forum's own new path, and every descendant's. */
  readonly pathUpdates: readonly PathUpdate[]
  /** Siblings whose `display_order` shifts to make room, plus the moved row. */
  readonly orderUpdates: readonly { readonly id: number; readonly displayOrder: number }[]
}
