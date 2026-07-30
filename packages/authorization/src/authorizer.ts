/**
 * The Authorizer (R4.3). The only object in the system that answers "may this
 * actor do this?".
 *
 * `can()` is synchronous and pure over an Actor and a Target whose forum matrix
 * is already resolved. The async methods (`forumMatrix`, `visibleForumIds`) do
 * the ancestor walk via the AuthorizationSource port and are the only ones that
 * touch data. This split is what lets the F22 matrix drive `can()` directly with
 * fixture data.
 */
import { ForbiddenError, type ForumPermissions } from '@forum/core'

import { resolveForumMatrix, indexOverrides } from './resolve'
import type {
  Action,
  Actor,
  AuthorizationSource,
  Target,
  Visible,
} from './types'

/** Emitted whenever an admin or super-mod bypass decides an outcome (R4.2: logged). */
export interface BypassEvent {
  readonly kind: 'administrator' | 'super_moderator'
  readonly userId: number | null
  readonly action: Action
  readonly forumId: number | undefined
}

export interface AuthorizerOptions {
  /**
   * Called every time a bypass grants an action that the forum matrix would
   * otherwise have denied. R4.2 requires bypasses be logged and never silent;
   * wiring this to the audit log is the composition root's job.
   */
  onBypass?: (event: BypassEvent) => void
}

/** Actions that are meaningless without a forum + resolved matrix in the Target. */
const FORUM_SCOPED: ReadonlySet<Action> = new Set<Action>([
  'forum.view',
  'thread.view',
  'thread.post',
  'reply.post',
  'post.editOwn',
  'post.editOthers',
  'post.deleteOwn',
  'post.softDelete',
  'content.viewUnapproved',
  'content.viewDeleted',
  'attachment.upload',
  'forum.search',
  'forum.subscribe',
])

/**
 * Actions an administrator's bypass may force-grant.
 *
 * `admincp.access` is deliberately NOT here. ACP access is decided earlier in
 * can() by the explicit `canAccessAdminCp` column and returns before this set is
 * ever consulted, so listing it would be dead code and — worse — misleading, by
 * implying the bypass can reach the ACP when the entire point is that it cannot.
 * The forum-scoped actions (spread in) plus the global staff/profile actions are
 * fair game; the one door the god-mode bypass never opens is the control panel.
 *
 * The four content/post actions previously listed here are already in
 * FORUM_SCOPED, so the spread covers them — they were redundant.
 */
const ADMIN_ALWAYS: ReadonlySet<Action> = new Set<Action>([
  ...FORUM_SCOPED,
  'modcp.access',
  'profile.view',
  'memberlist.view',
  'pm.use',
  /*
   * An administrator is not rate-limited between posts. The interval exists to
   * slow down abuse, and an administrator who has to wait fifteen seconds while
   * clearing a spam wave is being obstructed by a defence aimed at somebody
   * else. Logged like every other bypass, and cheap to audit — a post is not a
   * hot path.
   */
  'flood.bypass',
])

export class Authorizer {
  constructor(
    private readonly source: AuthorizationSource,
    private readonly options: AuthorizerOptions = {},
  ) {}

  /* -------------------------------------------------------------- *
   * Synchronous decision. Pure over (actor, action, target).
   * -------------------------------------------------------------- */
  can(actor: Actor, action: Action, target: Target = {}): boolean {
    // 1. Account-state gates run before anything else. A banned account cannot
    //    act no matter what its groups grant; an unactivated one is read-only.
    if (actor.state === 'banned') return false
    if (actor.state === 'awaiting_activation' && !isReadAction(action)) {
      return false
    }

    // 2. Administrator bypass. Explicit (reads a declared column) and logged.
    //    The single guarantee that a bypass cannot reach the control panel is
    //    that `admincp.access` is absent from ADMIN_ALWAYS — so it falls through
    //    to step 4 and is decided solely by the canAccessAdminCp column. There
    //    is deliberately no special-case for it here; one code path (canGlobal)
    //    owns that decision, and the ADMIN_ALWAYS membership test is what the
    //    bypass-isolation test pins.
    if (actor.global.isAdministrator === true && ADMIN_ALWAYS.has(action)) {
      this.logBypass('administrator', actor, action, target.forumId)
      return true
    }

    // 3. Super-moderator bypass: forum permissions only. admincp.access is not
    //    in FORUM_SCOPED, so this branch structurally cannot grant it.
    if (actor.global.isSuperModerator === true && FORUM_SCOPED.has(action)) {
      this.logBypass('super_moderator', actor, action, target.forumId)
      return true
    }

    // 4. Ordinary resolution.
    return FORUM_SCOPED.has(action)
      ? this.canForum(actor, action, target)
      : this.canGlobal(actor, action)
  }

  require(actor: Actor, action: Action, target: Target = {}): void {
    if (!this.can(actor, action, target)) {
      throw new ForbiddenError(`Not permitted: ${action}`, {
        meta: { userId: actor.userId, action, forumId: target.forumId },
      })
    }
  }

  /* -------------------------------------------------------------- *
   * Async resolution against the source.
   * -------------------------------------------------------------- */
  async forumMatrix(actor: Actor, forumId: number): Promise<ForumPermissions> {
    const chain = await this.source.ancestorChain(forumId)
    const groups = await this.source.groupDefaults(actor.groupIds)
    const overrides = await this.source.forumOverrides(chain, actor.groupIds)
    return resolveForumMatrix(chain, groups, indexOverrides(overrides))
  }

  /**
   * The single source of truth for visibility (F21). A forum the actor cannot
   * view is invisible everywhere, so every listing/search/feed funnels through
   * this set rather than re-deriving visibility ad hoc.
   */
  async visibleForumIds(actor: Actor): Promise<number[]> {
    if (actor.global.isAdministrator === true) {
      return [...(await this.source.allForumIds())]
    }

    /*
     * Three queries, and crucially a *constant* three: the whole board's
     * ancestor chains, the actor's group defaults, and every override for those
     * groups. Resolution then happens in memory.
     *
     * This used to walk per forum — two queries each — which is an N+1 that
     * grows with the board. Every list page filters by this set, so the cost was
     * multiplied across the entire product; F21 makes it an explicit acceptance
     * criterion and the testkit's budget assertion now holds it.
     *
     * It is three rather than literally one because the combination rules
     * (R4.2's OR/max/AND across groups, and first-non-null up the ancestor
     * chain) are domain logic. Pushing them into SQL would put the permission
     * model in the database, where F20's "nothing outside this package knows
     * what a group id is" stops being enforceable. See D26.
     */
    const chains = await this.source.allAncestorChains()
    const groups = await this.source.groupDefaults(actor.groupIds)

    const everyForumInvolved = [...new Set([...chains.values()].flat())]
    const overrides = indexOverrides(
      await this.source.forumOverrides(everyForumInvolved, actor.groupIds),
    )

    const visible: number[] = []
    // canView still applies to super-moderators: a hidden staff forum stays
    // hidden until a group grants canView, which matches MyBB.
    for (const [forumId, chain] of chains) {
      const matrix = resolveForumMatrix(chain, groups, overrides)
      if (matrix.canView === true) visible.push(forumId)
    }
    return visible
  }

  /** Drop rows in forums the actor cannot view. Synchronous: caller supplies the visible set. */
  filterVisible<T extends Visible>(
    _actor: Actor,
    visibleForumIds: ReadonlySet<number>,
    rows: readonly T[],
  ): T[] {
    return rows.filter((r) => visibleForumIds.has(r.forumId))
  }

  /* -------------------------------------------------------------- *
   * Internals
   * -------------------------------------------------------------- */
  private canForum(actor: Actor, action: Action, target: Target): boolean {
    const forum = target.forum
    if (!forum) {
      // A missing matrix is a wiring bug, not a denial. Failing loud stops a
      // forgotten `forumMatrix()` call from silently locking users out (or, if
      // it defaulted open, silently exposing a private forum).
      throw new Error(
        `Forum-scoped action "${action}" requires target.forum (resolved matrix). ` +
          `Call authorizer.forumMatrix() first.`,
      )
    }

    // canView underpins everything: no view, no forum-scoped action at all.
    if (forum.canView !== true) return false

    // Password gate. Seeing the forum exists (forum.view) survives an
    // unsatisfied password so it still renders in the index with a lock icon;
    // everything else is gated until the password is entered. Bypasses (admin,
    // super-mod) already returned true in can() before reaching here.
    if (
      target.passwordRequired === true &&
      target.passwordSatisfied !== true &&
      action !== 'forum.view'
    ) {
      return false
    }

    const ownsContent =
      target.ownerId != null && target.ownerId === actor.userId

    switch (action) {
      case 'forum.view':
        return true
      case 'thread.view':
        return forum.canViewThreads === true
      case 'forum.search':
        return forum.canSearch === true
      case 'forum.subscribe':
        return forum.canSubscribe === true
      case 'thread.post':
        return forum.canPostThreads === true
      case 'reply.post':
        return forum.canPostReplies === true
      case 'attachment.upload':
        return forum.canUploadAttachments === true
      case 'post.editOwn':
        return ownsContent && forum.canEditOwnPosts === true
      case 'post.deleteOwn':
        return ownsContent && forum.canDeleteOwnPosts === true
      case 'post.editOthers':
        return (
          (target.isForumModerator === true || forum.canEditOthersPosts === true) &&
          !ownsContent
        )
      case 'post.softDelete':
        return target.isForumModerator === true || forum.canSoftDeletePosts === true
      case 'content.viewUnapproved':
        // A forum moderator must see the queue they are meant to action; the
        // permission field is the group-level alternative for non-mod staff.
        return target.isForumModerator === true || forum.canViewUnapproved === true
      case 'content.viewDeleted':
        return target.isForumModerator === true || forum.canViewDeleted === true
      default: {
        const _exhaustive: never = action as never
        return Boolean(_exhaustive)
      }
    }
  }

  private canGlobal(actor: Actor, action: Action): boolean {
    switch (action) {
      case 'profile.view':
        return actor.global.canViewProfiles === true
      case 'memberlist.view':
        return actor.global.canViewMemberList === true
      case 'pm.use':
        return actor.global.canUsePrivateMessages === true
      case 'modcp.access':
        return actor.global.canAccessModCp === true
      case 'admincp.access':
        return actor.global.canAccessAdminCp === true
      case 'flood.bypass':
        return actor.global.canBypassFloodCheck === true
      default:
        return false
    }
  }

  private logBypass(
    kind: BypassEvent['kind'],
    actor: Actor,
    action: Action,
    forumId: number | undefined,
  ): void {
    this.options.onBypass?.({ kind, userId: actor.userId, action, forumId })
  }
}

/** Read-ish actions an unactivated account may still perform. */
function isReadAction(action: Action): boolean {
  return (
    action === 'forum.view' ||
    action === 'thread.view' ||
    action === 'forum.search' ||
    action === 'profile.view' ||
    action === 'memberlist.view'
  )
}
