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
import {
  ForbiddenError,
  contentScopeFrom,
  type ContentScope,
  type ForumPermissions,
} from '@forum/core'

import { NO_MODERATOR_RIGHTS, type ModeratorRights } from './types'

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
  'content.approve',
  'thread.lock',
  'thread.stick',
  'thread.move',
  'thread.delete',
  'thread.merge',
  'thread.split',
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
  'content.report',
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

  /**
   * The forums where this actor holds one moderator right (F48/F50).
   *
   * The first list on the board scoped by *moderator rights* rather than by
   * view permission, and the first thing ever to read `forum_moderators`. Two
   * sources, unioned:
   *
   *   - a group-level grant (`canApproveContent` on the resolved matrix), which
   *     is how staff groups get the whole board; and
   *   - an **appointment**, which is how one person gets one forum — expanded
   *     down the tree when it cascades.
   *
   * A forum the actor cannot even view is excluded from both. An appointment
   * over a forum that has since been hidden from its moderator's groups is a
   * configuration mistake, and the safe reading of it is the restrictive one.
   *
   * Constant-query like `visibleForumIds`, and for the same reason (D26): the
   * chains, the group defaults, the overrides and now the appointments, then
   * resolution in memory.
   */
  async moderatedForumIds(
    actor: Actor,
    right: keyof ModeratorRights = 'canApproveContent',
  ): Promise<number[]> {
    if (actor.global.isAdministrator === true || actor.global.isSuperModerator === true) {
      return [...(await this.source.allForumIds())]
    }

    const [chains, groups, appointments] = await Promise.all([
      this.source.allAncestorChains(),
      this.source.groupDefaults(actor.groupIds),
      this.source.moderatorAppointments(actor.userId, actor.groupIds),
    ])

    const everyForumInvolved = [...new Set([...chains.values()].flat())]
    const overrides = indexOverrides(
      await this.source.forumOverrides(everyForumInvolved, actor.groupIds),
    )

    /*
     * An appointment applies to its own forum always, and to a descendant only
     * when it cascades. "Descendant" is read off the ancestor chain rather than
     * from a path prefix — the chain is already the authoritative answer here,
     * and it cannot fall into D22's `1.4` / `1.40` trap because it compares ids.
     */
    const approvesByAppointment = new Set<number>()
    for (const [forumId, chain] of chains) {
      for (const appointment of appointments) {
        if (!appointment[right]) continue
        if (appointment.forumId === forumId) {
          approvesByAppointment.add(forumId)
        } else if (appointment.cascadeToSubforums && chain.includes(appointment.forumId)) {
          approvesByAppointment.add(forumId)
        }
      }
    }

    const moderated: number[] = []
    for (const [forumId, chain] of chains) {
      const matrix = resolveForumMatrix(chain, groups, overrides)
      if (matrix.canView !== true) continue
      /*
       * The group-level half only exists for approval — F50's thread tools have
       * no usergroup column at all, by design (see `canForum`). For those
       * rights the appointment is the only route short of a staff bypass, which
       * is handled above.
       */
      const byGroup = right === 'canApproveContent' && matrix.canApproveContent === true
      if (byGroup || approvesByAppointment.has(forumId)) moderated.push(forumId)
    }
    return moderated
  }

  /**
   * Which per-group configuration rows apply to this actor (F59).
   *
   * The generic half of what `forumMatrix` does for forum permissions, and it
   * exists because F59's profile fields carry the same nullable-inheritance
   * shape F21 gave `forum_permissions` — but for a table this package has no
   * business knowing about.
   *
   * **It returns rows, never ids.** That is the whole design: a caller gets the
   * subset of *its own configuration* that this actor's groups matched, and can
   * combine those rows by R4.2's rule without ever learning which groups
   * somebody is in. Handing out the group ids instead would be an escape hatch
   * around the lint rule that keeps group-ID reasoning inside this package
   * (F20/D13), and every caller would then be free to invent its own
   * combination semantics.
   *
   * A guest matches the guest group like anybody else — `Actor.groupIds` always
   * holds at least one group — so there is no special case here.
   */
  applicableGroupRows<T extends { readonly groupId: number }>(
    actor: Actor,
    rows: readonly T[],
  ): readonly T[] {
    return this.applicableGroupRowsForGroups(actor.groupIds, rows)
  }

  /**
   * The same narrowing, for somebody who has no `Actor` yet (F59).
   *
   * Exactly one caller is legitimate: registration. An applicant is not a
   * member of anything — they are about to become a member of the board's
   * configured default group — so there is no actor to build and no groups to
   * read off one. Asking "what would this group be allowed to fill in" is the
   * only way the register form can offer the fields a new member will owe.
   *
   * `groupIds` must come from **configuration** (`AuthConfig.defaultMemberGroupId`
   * and friends), never from an actor: the point of `applicableGroupRows` above
   * is that no caller reads `Actor.groupIds`, and routing around it through
   * here would give back exactly what that method exists to withhold. The lint
   * rule (F20/D13) still refuses the read, which is what keeps this honest.
   */
  applicableGroupRowsForGroups<T extends { readonly groupId: number }>(
    groupIds: readonly number[],
    rows: readonly T[],
  ): readonly T[] {
    const mine = new Set(groupIds)
    return rows.filter((row) => mine.has(row.groupId))
  }

  /**
   * This actor's granular moderator rights in one forum (F50).
   *
   * The other half of `moderatedForumIds`: that answers *where*, this answers
   * *what*. Rights from several appointments covering the same forum are
   * **unioned** — a personal appointment that can lock plus a group appointment
   * that can move means both, because two grants are two grants.
   *
   * Administrators and super-moderators get everything, matching the bypasses
   * `can()` applies before it ever consults these. Returning the full set here
   * rather than relying on the bypass keeps the *screen* honest too: a control
   * offered on the strength of these rights appears for staff, and the action
   * behind it reaches the same conclusion by its own route.
   */
  async moderatorRightsIn(actor: Actor, forumId: number): Promise<ModeratorRights> {
    if (
      actor.global.isAdministrator === true ||
      actor.global.isSuperModerator === true
    ) {
      return ALL_MODERATOR_RIGHTS
    }
    if (actor.userId === null) return NO_MODERATOR_RIGHTS

    const [chain, appointments] = await Promise.all([
      this.source.ancestorChain(forumId),
      this.source.moderatorAppointments(actor.userId, actor.groupIds),
    ])
    if (chain.length === 0) return NO_MODERATOR_RIGHTS

    /*
     * `chain` is [self, ...ancestors]. An appointment applies to its own forum
     * always, and to a descendant only when it cascades — read off the chain by
     * id rather than by path prefix, which is why it cannot fall into D22's
     * `1.4` / `1.40` trap.
     */
    let rights = NO_MODERATOR_RIGHTS
    for (const appointment of appointments) {
      const covers =
        appointment.forumId === forumId ||
        (appointment.cascadeToSubforums && chain.includes(appointment.forumId))
      if (covers) rights = unionRights(rights, appointment)
    }
    return rights
  }

  /**
   * Every forum where this actor may perform one forum-scoped action (F52).
   *
   * The generalisation of `moderatedForumIds`, and the difference matters.
   * That one is keyed by a `ModeratorRights` field, which is the right question
   * for the queue — "where am I a moderator" — and the wrong one for a *tool*,
   * because one rights field can mean two things. `canSoftDeletePosts` grants
   * `post.softDelete` through a group column *or* an appointment, but grants
   * `thread.delete` through the appointment only (F50 gave the thread tools no
   * group column on purpose). Keying by right cannot express that; keying by
   * **action** can, because `can()` already knows.
   *
   * So this builds the same Target a page would build — resolved matrix,
   * resolved appointment rights, and `isForumModerator` actually set — and asks
   * `can()` once per forum. Same three source reads as `visibleForumIds` plus
   * the appointments, resolved in memory (D26): constant-query, not per forum.
   *
   * F52 needs it as a *scope*, not as a convenience. Inline moderation re-reads
   * every submitted id to find its real forum, and if that read ranged over the
   * whole board then "refused" and "no such thing" would be different answers —
   * which is a content-existence oracle over every private forum on the board
   * (the trap F51 named for its merge box). Scoping the re-read to this set
   * makes both cases indistinguishable.
   */
  async forumIdsWhere(actor: Actor, action: Action): Promise<number[]> {
    if (!FORUM_SCOPED.has(action)) {
      throw new Error(`forumIdsWhere is only meaningful for forum-scoped actions: ${action}`)
    }
    if (actor.state === 'banned') return []

    /*
     * The staff short-circuit is not an optimisation, and it changes the answer
     * twice over.
     *
     *   - **It logs once.** Running the loop for an administrator would call
     *     `can()` once per forum and every one of those calls logs a bypass —
     *     fifty audit lines for one page load, burying the bypasses that
     *     describe an actual decision.
     *   - **It agrees with `can()`.** The loop below drops any forum the actor
     *     cannot view, which is right for an ordinary moderator and wrong for
     *     staff: `can()` grants every forum-scoped action to a super-moderator
     *     *before* it looks at the matrix at all. A scope narrower than `can()`
     *     would report work as out of reach that the action would then permit,
     *     which is the screen and the decision disagreeing.
     *     `moderatedForumIds` returns the whole board for the same reason.
     */
    if (actor.global.isAdministrator === true && ADMIN_ALWAYS.has(action)) {
      this.logBypass('administrator', actor, action, undefined)
      return [...(await this.source.allForumIds())]
    }
    if (actor.global.isSuperModerator === true) {
      this.logBypass('super_moderator', actor, action, undefined)
      return [...(await this.source.allForumIds())]
    }

    const [chains, groups, appointments] = await Promise.all([
      this.source.allAncestorChains(),
      this.source.groupDefaults(actor.groupIds),
      this.source.moderatorAppointments(actor.userId, actor.groupIds),
    ])

    const everyForumInvolved = [...new Set([...chains.values()].flat())]
    const overrides = indexOverrides(
      await this.source.forumOverrides(everyForumInvolved, actor.groupIds),
    )

    const permitted: number[] = []
    for (const [forumId, chain] of chains) {
      const forum = resolveForumMatrix(chain, groups, overrides)
      // A forum the actor cannot even view is never a place they may act.
      if (forum.canView !== true) continue

      /*
       * The appointment, folded down the chain exactly as `moderatorRightsIn`
       * does it — by id rather than by path prefix, so D22's `1.4` / `1.40`
       * trap cannot reach here.
       */
      let moderatorRights = NO_MODERATOR_RIGHTS
      let appointed = false
      for (const appointment of appointments) {
        const covers =
          appointment.forumId === forumId ||
          (appointment.cascadeToSubforums && chain.includes(appointment.forumId))
        if (!covers) continue
        appointed = true
        moderatorRights = unionRights(moderatorRights, appointment)
      }

      /*
       * `isForumModerator` set from the appointment — the flag F48 introduced
       * and then had to record as debt because no per-page `can()` call ever
       * set it. Here it is set, which is why an appointee's `post.softDelete`
       * resolves the same way in bulk as it does on their own post.
       */
      if (this.can(actor, action, { forumId, forum, moderatorRights, isForumModerator: appointed })) {
        permitted.push(forumId)
      }
    }
    return permitted
  }

  /**
   * Which content states this actor may see in this forum (F47).
   *
   * The **only** producer of a `ContentScope`. Every viewer-facing read takes
   * one and no read names a visibility state itself, so "who can see removed
   * content" is answered once, by the permission model, instead of by each
   * query's own predicate. `pnpm guards` fails the build on the alternative.
   *
   * Synchronous and pure like the rest of `can()`: the caller supplies the
   * already-resolved forum matrix, so this adds no queries to a page that has
   * already resolved one.
   */
  contentScope(actor: Actor, target: Target): ContentScope {
    return contentScopeFrom({
      seesUnapproved: this.can(actor, 'content.viewUnapproved', target),
      seesDeleted: this.can(actor, 'content.viewDeleted', target),
    })
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
      case 'content.approve':
        /*
         * `isForumModerator` alone is not enough here, unlike the actions
         * above: an appointment carries granular rights, and one that does not
         * include `canApproveContent` appoints somebody to *read* the queue.
         * The caller resolves those rights and passes them as `moderatorRights`.
         */
        return (
          target.moderatorRights?.canApproveContent === true ||
          forum.canApproveContent === true
        )

      /*
       * F50's four. Unlike every action above them, these have **no group-level
       * permission field** — MyBB has never had one either, and neither should
       * we: "may lock threads everywhere on the board" is a thing you are
       * appointed to or a thing you bypass into as staff, not a checkbox on a
       * usergroup. So each reads its appointment right and nothing else; the
       * administrator and super-moderator bypasses are handled before this
       * switch is ever reached.
       */
      case 'thread.lock':
        return target.moderatorRights?.canOpenCloseThreads === true
      case 'thread.stick':
        return target.moderatorRights?.canStickThreads === true
      case 'thread.move':
        return target.moderatorRights?.canMoveThreads === true
      case 'thread.delete':
        return target.moderatorRights?.canSoftDeletePosts === true
      case 'thread.merge':
        return target.moderatorRights?.canMergeThreads === true
      case 'thread.split':
        return target.moderatorRights?.canSplitThreads === true
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
      case 'content.report':
        return actor.global.canReportContent === true
      case 'user.warn':
        return actor.global.canWarnUsers === true
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

/** Everything: what a staff bypass amounts to, spelled out. */
const ALL_MODERATOR_RIGHTS: ModeratorRights = {
  canApproveContent: true,
  canEditPosts: true,
  canSoftDeletePosts: true,
  canRestorePosts: true,
  canOpenCloseThreads: true,
  canStickThreads: true,
  canMoveThreads: true,
  canMergeThreads: true,
  canSplitThreads: true,
}

/** Two grants are two grants: rights union rather than override. */
function unionRights(a: ModeratorRights, b: ModeratorRights): ModeratorRights {
  return {
    canApproveContent: a.canApproveContent || b.canApproveContent,
    canEditPosts: a.canEditPosts || b.canEditPosts,
    canSoftDeletePosts: a.canSoftDeletePosts || b.canSoftDeletePosts,
    canRestorePosts: a.canRestorePosts || b.canRestorePosts,
    canOpenCloseThreads: a.canOpenCloseThreads || b.canOpenCloseThreads,
    canStickThreads: a.canStickThreads || b.canStickThreads,
    canMoveThreads: a.canMoveThreads || b.canMoveThreads,
    canMergeThreads: a.canMergeThreads || b.canMergeThreads,
    canSplitThreads: a.canSplitThreads || b.canSplitThreads,
  }
}
