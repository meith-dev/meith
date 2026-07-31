/**
 * Authorization vocabulary and the port it resolves against.
 *
 * This package is the *only* place in the codebase that knows a group ID is a
 * number or that forum permissions inherit down a tree (F20). Everything else
 * asks `can(actor, action, target)` and receives a boolean. The moment a group
 * ID comparison appears anywhere else, the model rots — there is a lint rule
 * (see eslint.config.mjs `no-restricted-syntax`) that fires on it.
 *
 * It imports only `@forum/core` (the permission registry and error types), never
 * `@forum/db`: the resolution logic is pure and is driven through the
 * `AuthorizationSource` port below, so the F22 matrix suite can exercise every
 * actor/context/action combination against an in-memory fixture with no
 * database (R10, F22).
 */
import type {
  ContentVisibility,
  ForumPermissions,
  PermissionSet,
} from '@forum/core'

/**
 * The lifecycle state of the account behind a request.
 *
 * Kept separate from permissions because these gate *before* permissions are
 * consulted: a banned user with an admin group still cannot act, and an
 * unactivated user is read-mostly regardless of what its groups grant.
 */
export type ActorState =
  | 'guest'
  | 'active'
  | 'banned'
  | 'awaiting_activation'

/**
 * A fully-resolved principal. Construction (combining groups, loading state) is
 * the repository's job; by the time an Actor exists, `global` already reflects
 * the R4.2 combination across every group the user belongs to.
 *
 * `permissionVersion` is the global cache key from F20: bumping the board-wide
 * counter invalidates every cached Actor at once, which is how an ACP
 * permission edit takes effect without hunting down per-user cache entries.
 */
export interface Actor {
  /** null for an unauthenticated guest. */
  readonly userId: number | null
  /** Every group the user belongs to (primary + secondary). Never empty: guests are in the guest group. */
  readonly groupIds: readonly number[]
  readonly primaryGroupId: number | null
  readonly state: ActorState
  /** Resolved global permissions (R4.1 layer 1), already combined across groups. */
  readonly global: PermissionSet
  readonly permissionVersion: number
}

/**
 * The twelve actions the F22 matrix enumerates, plus the handful of global ones
 * the product needs. Adding an action here forces a new column in the F22
 * fixture — which is exactly the regression net F22 demands.
 */
export type Action =
  // --- forum-scoped, in a Target with a resolved matrix ---
  | 'forum.view'
  | 'thread.view'
  | 'thread.post'
  | 'reply.post'
  | 'post.editOwn'
  | 'post.editOthers'
  | 'post.deleteOwn'
  | 'post.softDelete'
  | 'content.viewUnapproved'
  | 'content.viewDeleted'
  /**
   * Act on the queue: approve or reject held content (F48).
   *
   * Deliberately distinct from `content.viewUnapproved`. Seeing what is waiting
   * and deciding what happens to it are different powers, and MyBB has had the
   * two as separate columns since forever (`canviewunapprove` /
   * `canapproveunapprove`). Collapsing them would mean any role trusted to read
   * the queue could empty it.
   */
  | 'content.approve'
  /* --- F50's thread tools. Appointment rights plus the staff bypasses. --- */
  | 'thread.lock'
  | 'thread.stick'
  | 'thread.move'
  | 'thread.delete'
  | 'thread.merge'
  | 'thread.split'
  | 'attachment.upload'
  | 'forum.search'
  | 'forum.subscribe'
  // --- global, need no forum context ---
  | 'profile.view'
  | 'memberlist.view'
  | 'pm.use'
  /**
   * File a report (F49).
   *
   * Global, and deliberately not in the F22 forum matrix: reporting is a
   * board-wide capability granted by `canReportContent`, not a per-forum grant.
   * The *target* is still checked forum by forum — a member cannot report what
   * they could not see — but that check is `thread.view`, which the matrix
   * already covers.
   */
  | 'content.report'
  | 'modcp.access'
  | 'admincp.access'
  /**
   * Warn a member, or revoke a warning (F53).
   *
   * Global, and deliberately not in the F22 forum matrix: a warning is aimed at
   * a *person* and its points follow them across the whole board, so a
   * per-forum grant would have to answer "warned where?" about a total that has
   * no forum. MyBB's `canwarnusers` is global for the same reason.
   */
  | 'user.warn'
  /**
   * Exempt from the between-posts flood interval (F39/F40).
   *
   * Global, and deliberately not in the F22 forum matrix: the interval is a
   * board setting rather than a per-forum grant, which is the parity decision
   * recorded in `docs/mybb-parity.md#flood-intervals`. It exists as an action so
   * the posting path can ask `can()` instead of reading a permission field —
   * group and permission reasoning does not leave this package (R4).
   */
  | 'flood.bypass'

/**
 * The visibility state of a piece of content.
 *
 * Re-exported from `@forum/core` rather than declared again: F47 made the
 * states and the scope built from them a single shared vocabulary, and two
 * structurally-identical declarations are how they drift.
 */
export type { ContentVisibility }

/**
 * What an action is being performed *on*.
 *
 * `forum` carries the already-resolved per-forum matrix so `can()` stays
 * synchronous and pure — the async walk happens once in `forumMatrix()`, and its
 * result is threaded into every `can()` call for that forum. A forum-scoped
 * action with no `forum` present is a programming error, not a denial, and
 * throws rather than silently returning false.
 */
export interface Target {
  readonly forumId?: number
  /** Resolved forum matrix from `Authorizer.forumMatrix()`. */
  readonly forum?: ForumPermissions
  /** Author of the content being acted on, for own-vs-others checks. */
  readonly ownerId?: number | null
  /** Visibility of the content, for the view-unapproved / view-deleted actions. */
  readonly visibility?: ContentVisibility
  /**
   * Whether the actor is a moderator of this forum (F21 forum_moderators,
   * including subforum cascade). Resolved by the repository alongside the matrix.
   */
  readonly isForumModerator?: boolean
  /**
   * This actor's appointment rights in this forum, if any (F48/F50).
   *
   * Separate from `isForumModerator` because an appointment's rights are
   * granular: being a moderator here does not by itself mean being trusted to
   * empty the queue, move threads, or lock them. Resolved by
   * `Authorizer.moderatorRightsIn`.
   */
  readonly moderatorRights?: ModeratorRights
  /**
   * Whether this forum is password-protected. Orthogonal to the permission
   * matrix: password protection is a property of the forum row, not a group
   * grant, so it cannot be expressed as a permission field.
   */
  readonly passwordRequired?: boolean
  /**
   * For password-protected forums: whether the actor has already entered the
   * password this session. A forum can still be seen to *exist* in the index
   * (forum.view) while everything inside it stays gated until this is true.
   */
  readonly passwordSatisfied?: boolean
}

/* ------------------------------------------------------------------ *
 * The port. Implemented by @forum/db (Postgres) and by the F22 fixture.
 * ------------------------------------------------------------------ */

/** A single group's global defaults, as stored on `usergroups`. */
export interface GroupDefaults {
  readonly groupId: number
  readonly permissions: PermissionSet
}

/**
 * One `forum_permissions(forum_id, group_id)` row. Every forum-scoped field is
 * nullable; `null` means "inherit from the parent forum" (R4.1 layer 2).
 */
export interface ForumOverride {
  readonly forumId: number
  readonly groupId: number
  /** Partial: only the keys this row actually overrides are present and non-null. */
  readonly overrides: Partial<ForumPermissions>
}

/**
 * The data-access port for authorization. Deliberately narrow: these are the
 * only questions the resolver asks, so the fixture is small and the Postgres
 * implementation has a clear contract to satisfy.
 */
export interface AuthorizationSource {
  /** Global defaults for exactly these groups. */
  groupDefaults(groupIds: readonly number[]): Promise<readonly GroupDefaults[]>
  /**
   * Forum IDs from `forumId` up to the root, nearest first, inclusive. Empty
   * when the forum does not exist.
   */
  ancestorChain(forumId: number): Promise<readonly number[]>
  /** Overrides for any of these forums and any of these groups. */
  forumOverrides(
    forumIds: readonly number[],
    groupIds: readonly number[],
  ): Promise<readonly ForumOverride[]>
  /** Every forum ID on the board, used to compute the visible set. */
  allForumIds(): Promise<readonly number[]>

  /**
   * Every forum's ancestor chain in one call, nearest-first and inclusive —
   * the same shape `ancestorChain` returns, for the whole board at once.
   *
   * Exists because `visibleForumIds` needs the chain for *every* forum, and
   * asking per forum is an N+1 that scales with the size of the board. Every
   * list page filters by the visible set, so that cost is multiplied across the
   * entire product. F21 makes this an explicit acceptance criterion.
   */
  allAncestorChains(): Promise<ReadonlyMap<number, readonly number[]>>

  /**
   * This actor's moderator appointments (F21's `forum_moderators`, read for the
   * first time at F48).
   *
   * The table has existed since F21 and nothing has ever consulted it, so until
   * now "moderator" in practice meant "member of a staff group". An appointment
   * is the other half: one person given rights over one forum, optionally
   * cascading to its subforums, with each right granted individually.
   *
   * Returns the appointments themselves rather than an expanded forum set,
   * because expansion needs the tree and the tree already lives in
   * `allAncestorChains()` — resolving it here would mean a second walk in the
   * adapter and a second place to get the prefix trap wrong (D22).
   */
  moderatorAppointments(
    userId: number | null,
    groupIds: readonly number[],
  ): Promise<readonly ModeratorAppointment[]>
}

/**
 * The granular rights an appointment carries.
 *
 * Deliberately explicit booleans rather than a bitmask, matching the columns —
 * a bitmask saves bytes nobody is short of and makes every screen and every
 * test read as magic numbers.
 */
export interface ModeratorRights {
  readonly canApproveContent: boolean
  readonly canEditPosts: boolean
  readonly canSoftDeletePosts: boolean
  readonly canRestorePosts: boolean
  readonly canOpenCloseThreads: boolean
  readonly canStickThreads: boolean
  readonly canMoveThreads: boolean
  readonly canMergeThreads: boolean
  readonly canSplitThreads: boolean
}

/** One row of `forum_moderators`, as the Authorizer needs it. */
export interface ModeratorAppointment extends ModeratorRights {
  readonly forumId: number
  readonly cascadeToSubforums: boolean
}

/**
 * Whether an appointment grants anything at all — the value of
 * `Target.isForumModerator` (F52).
 *
 * A named function rather than `Object.values(rights).some(Boolean)` written
 * out at each call site, because it is a *permission* question and R4 says
 * those are answered here. It also cannot drift: adding a right to
 * `ModeratorRights` extends this automatically, whereas three hand-written
 * copies would each have to be found.
 */
export function hasAnyModeratorRight(rights: ModeratorRights): boolean {
  return (
    rights.canApproveContent ||
    rights.canEditPosts ||
    rights.canSoftDeletePosts ||
    rights.canRestorePosts ||
    rights.canOpenCloseThreads ||
    rights.canStickThreads ||
    rights.canMoveThreads ||
    rights.canMergeThreads ||
    rights.canSplitThreads
  )
}

/** Nobody's rights: the answer for an actor with no appointment here. */
export const NO_MODERATOR_RIGHTS: ModeratorRights = {
  canApproveContent: false,
  canEditPosts: false,
  canSoftDeletePosts: false,
  canRestorePosts: false,
  canOpenCloseThreads: false,
  canStickThreads: false,
  canMoveThreads: false,
  canMergeThreads: false,
  canSplitThreads: false,
}

/**
 * Turns a user id — or nobody — into a fully-resolved `Actor`.
 *
 * Kept separate from `AuthorizationSource`: that port answers *permission*
 * questions (what does group N grant in forum F), whereas this one assembles the
 * *principal* (which groups is user U in, what is their state, combine it all).
 * The authorizer consumes the `Actor` this produces and never calls back into
 * it. Two implementations: `ActorBuilder` in `@forum/db` (Postgres, primary +
 * secondary groups, cache-version stamp) and a fixture builder in the app tier.
 */
export interface ActorSource {
  /** The anonymous principal: the guest group, `state: 'guest'`, no user id. */
  buildGuest(): Promise<Actor>
  /**
   * The principal behind a user id, or null when the user does not exist or is
   * not a valid principal (deleted) — the caller then falls back to a guest.
   */
  buildForUser(userId: number): Promise<Actor | null>
}

/** Marker for rows that can be visibility-filtered by `filterVisible`. */
export interface Visible {
  readonly forumId: number
}
