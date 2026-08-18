import {
  authorFilterFrom,
  type ContentScope,
  contentScopeFrom,
  ForbiddenError,
  type ForumPermissions,
  NO_THREAD_AUDIENCE,
  type ThreadAudience,
  type ThreadAuthorFilter,
  unrestrictedAudience,
} from '@meith/core'

import { indexOverrides, resolveForumMatrix } from './resolve'
import type {
  Action,
  Actor,
  AuthorizationSource,
  ModeratedTarget,
  NumericGlobalPermission,
  Target,
  Visible,
} from './types'
import { hasAnyModeratorRight, type ModeratorRights, NO_MODERATOR_RIGHTS } from './types'

export interface BypassEvent {
  readonly kind: 'administrator' | 'super_moderator'
  readonly userId: number | null
  readonly action: Action
  readonly forumId: number | undefined
}

export interface AuthorizerOptions {
  onBypass?: (event: BypassEvent) => void
}

const FORUM_SCOPED: ReadonlySet<Action> = new Set<Action>([
  'forum.view',
  'thread.view',
  'thread.viewOthers',
  'thread.post',
  'reply.post',
  'poll.post',
  'poll.vote',
  'thread.rate',
  'post.editOwn',
  'post.editOthers',
  'post.deleteOwn',
  'post.softDelete',
  'post.restore',
  'content.viewUnapproved',
  'content.viewDeleted',
  'content.approve',
  'thread.lock',
  'thread.stick',
  'thread.move',
  'thread.delete',
  'thread.restore',
  'thread.merge',
  'thread.split',
  'attachment.upload',
  'attachment.download',
  'forum.search',
  'forum.subscribe',
])

const ADMIN_ALWAYS: ReadonlySet<Action> = new Set<Action>([
  ...FORUM_SCOPED,
  'modcp.access',
  'profile.view',
  'memberlist.view',
  'pm.use',
  'content.report',
  'reputation.give',
  'signature.use',
  'flood.bypass',
  'board.viewOffline',
])

export class Authorizer {
  constructor(
    private readonly source: AuthorizationSource,
    private readonly options: AuthorizerOptions = {},
  ) {}

  can(actor: Actor, action: Action, target: Target = {}): boolean {
    if (actor.state === 'banned') return false
    if (actor.state === 'awaiting_activation' && !isReadAction(action)) {
      return false
    }

    if (actor.global.isAdministrator === true && ADMIN_ALWAYS.has(action)) {
      this.logBypass('administrator', actor, action, target.forumId)
      return true
    }

    if (actor.global.isSuperModerator === true && FORUM_SCOPED.has(action)) {
      this.logBypass('super_moderator', actor, action, target.forumId)
      return true
    }

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

  inAnyGroup(actor: Actor, groupIds: readonly number[]): boolean {
    if (groupIds.length === 0) return true
    return actor.groupIds.some((id) => groupIds.includes(id))
  }

  async forumMatrix(actor: Actor, forumId: number): Promise<ForumPermissions> {
    const chain = await this.source.ancestorChain(forumId)
    const groups = await this.source.groupDefaults(actor.groupIds)
    const overrides = await this.source.forumOverrides(chain, actor.groupIds)
    return resolveForumMatrix(chain, groups, indexOverrides(overrides))
  }

  async visibleForumIds(actor: Actor): Promise<number[]> {
    if (actor.global.isAdministrator === true) {
      return [...(await this.source.allForumIds())]
    }

    const chains = await this.source.allAncestorChains()
    const groups = await this.source.groupDefaults(actor.groupIds)

    const everyForumInvolved = [...new Set([...chains.values()].flat())]
    const overrides = indexOverrides(
      await this.source.forumOverrides(everyForumInvolved, actor.groupIds),
    )

    const visible: number[] = []
    for (const [forumId, chain] of chains) {
      const matrix = resolveForumMatrix(chain, groups, overrides)
      if (matrix.canView === true) visible.push(forumId)
    }
    return visible
  }

  async listingVisibility(actor: Actor): Promise<{
    readonly visibleForumIds: number[]
    readonly ownThreadsOnlyForumIds: number[]
  }> {
    if (actor.global.isAdministrator === true) {
      return {
        visibleForumIds: [...(await this.source.allForumIds())],
        ownThreadsOnlyForumIds: [],
      }
    }

    const visibleForumIds: number[] = []
    const ownThreadsOnlyForumIds: number[] = []
    for (const target of await this.resolvedTargets(actor)) {
      visibleForumIds.push(target.forumId)
      if (this.can(actor, 'thread.view', target) && !this.can(actor, 'thread.viewOthers', target)) {
        ownThreadsOnlyForumIds.push(target.forumId)
      }
    }
    return { visibleForumIds, ownThreadsOnlyForumIds }
  }

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
      const byGroup = right === 'canApproveContent' && matrix.canApproveContent === true
      if (byGroup || approvesByAppointment.has(forumId)) moderated.push(forumId)
    }
    return moderated
  }

  applicableGroupRows<T extends { readonly groupId: number }>(
    actor: Actor,
    rows: readonly T[],
  ): readonly T[] {
    return this.applicableGroupRowsForGroups(actor.groupIds, rows)
  }

  applicableGroupRowsForGroups<T extends { readonly groupId: number }>(
    groupIds: readonly number[],
    rows: readonly T[],
  ): readonly T[] {
    const mine = new Set(groupIds)
    return rows.filter((row) => mine.has(row.groupId))
  }

  async moderatorRightsIn(actor: Actor, forumId: number): Promise<ModeratorRights> {
    if (actor.global.isAdministrator === true || actor.global.isSuperModerator === true) {
      return ALL_MODERATOR_RIGHTS
    }
    if (actor.userId === null) return NO_MODERATOR_RIGHTS

    const [chain, appointments] = await Promise.all([
      this.source.ancestorChain(forumId),
      this.source.moderatorAppointments(actor.userId, actor.groupIds),
    ])
    if (chain.length === 0) return NO_MODERATOR_RIGHTS

    let rights = NO_MODERATOR_RIGHTS
    for (const appointment of appointments) {
      const covers =
        appointment.forumId === forumId ||
        (appointment.cascadeToSubforums && chain.includes(appointment.forumId))
      if (covers) rights = unionRights(rights, appointment)
    }
    return rights
  }

  async forumIdsWhere(actor: Actor, action: Action): Promise<number[]> {
    if (!FORUM_SCOPED.has(action)) {
      throw new Error(`forumIdsWhere is only meaningful for forum-scoped actions: ${action}`)
    }
    if (actor.state === 'banned') return []

    if (actor.global.isAdministrator === true && ADMIN_ALWAYS.has(action)) {
      this.logBypass('administrator', actor, action, undefined)
      return [...(await this.source.allForumIds())]
    }
    if (actor.global.isSuperModerator === true) {
      this.logBypass('super_moderator', actor, action, undefined)
      return [...(await this.source.allForumIds())]
    }

    const permitted: number[] = []
    for (const target of await this.resolvedTargets(actor)) {
      if (this.can(actor, action, target)) permitted.push(target.forumId)
    }
    return permitted
  }

  async threadAudience(actor: Actor): Promise<ThreadAudience> {
    if (actor.state === 'banned') {
      return { ...NO_THREAD_AUDIENCE, viewerUserId: actor.userId }
    }

    if (actor.global.isAdministrator === true) {
      this.logBypass('administrator', actor, 'thread.view', undefined)
      return unrestrictedAudience([...(await this.source.allForumIds())], actor.userId)
    }
    if (actor.global.isSuperModerator === true) {
      this.logBypass('super_moderator', actor, 'thread.view', undefined)
      return unrestrictedAudience([...(await this.source.allForumIds())], actor.userId)
    }

    const forumIds: number[] = []
    const ownThreadsOnlyForumIds: number[] = []
    for (const target of await this.resolvedTargets(actor)) {
      if (!this.can(actor, 'thread.view', target)) continue
      forumIds.push(target.forumId)
      if (!this.can(actor, 'thread.viewOthers', target)) {
        ownThreadsOnlyForumIds.push(target.forumId)
      }
    }
    return { forumIds, ownThreadsOnlyForumIds, viewerUserId: actor.userId }
  }

  authorFilter(actor: Actor, target: Target): ThreadAuthorFilter {
    return authorFilterFrom({
      seesOthersThreads: this.can(actor, 'thread.viewOthers', target),
      viewerUserId: actor.userId,
    })
  }

  async authorFilterIn(
    actor: Actor,
    forumId: number,
    forum: ForumPermissions,
  ): Promise<ThreadAuthorFilter> {
    return this.authorFilter(actor, await this.moderatorTargetIn(actor, forumId, forum))
  }

  private async resolvedTargets(actor: Actor): Promise<readonly ModeratedTarget[]> {
    const [chains, groups, appointments] = await Promise.all([
      this.source.allAncestorChains(),
      this.source.groupDefaults(actor.groupIds),
      this.source.moderatorAppointments(actor.userId, actor.groupIds),
    ])

    const everyForumInvolved = [...new Set([...chains.values()].flat())]
    const overrides = indexOverrides(
      await this.source.forumOverrides(everyForumInvolved, actor.groupIds),
    )

    const targets: ModeratedTarget[] = []
    for (const [forumId, chain] of chains) {
      const forum = resolveForumMatrix(chain, groups, overrides)
      if (forum.canView !== true) continue

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

      targets.push({
        forumId,
        forum,
        moderatorRights,
        isForumModerator: appointed,
      })
    }
    return targets
  }

  contentScope(actor: Actor, target: Target): ContentScope {
    return contentScopeFrom({
      seesUnapproved: this.can(actor, 'content.viewUnapproved', target),
      seesDeleted: this.can(actor, 'content.viewDeleted', target),
    })
  }

  async moderatorTargetIn(
    actor: Actor,
    forumId: number,
    forum: ForumPermissions,
  ): Promise<ModeratedTarget> {
    const moderatorRights = await this.moderatorRightsIn(actor, forumId)
    return {
      forumId,
      forum,
      moderatorRights,
      isForumModerator: hasAnyModeratorRight(moderatorRights),
    }
  }

  async contentScopeIn(
    actor: Actor,
    forumId: number,
    forum: ForumPermissions,
  ): Promise<ContentScope> {
    return this.contentScope(actor, await this.moderatorTargetIn(actor, forumId, forum))
  }

  globalLimit(actor: Actor, key: NumericGlobalPermission): number {
    const value = actor.global[key]
    return typeof value === 'number' ? value : 0
  }

  filterVisible<T extends Visible>(
    _actor: Actor,
    visibleForumIds: ReadonlySet<number>,
    rows: readonly T[],
  ): T[] {
    return rows.filter((r) => visibleForumIds.has(r.forumId))
  }

  private canForum(actor: Actor, action: Action, target: Target): boolean {
    const forum = target.forum
    if (!forum) {
      throw new Error(
        `Forum-scoped action "${action}" requires target.forum (resolved matrix). ` +
          `Call authorizer.forumMatrix() first.`,
      )
    }

    if (forum.canView !== true) return false

    if (
      target.passwordRequired === true &&
      target.passwordSatisfied !== true &&
      action !== 'forum.view'
    ) {
      return false
    }

    const ownsContent = target.ownerId != null && target.ownerId === actor.userId
    const ownsThread = target.threadAuthorId != null && target.threadAuthorId === actor.userId

    switch (action) {
      case 'forum.view':
        return true
      case 'thread.view': {
        if (forum.canViewThreads !== true) return false
        const author = target.threadAuthorId
        if (author === undefined) return true
        if (author !== null && author === actor.userId) return true
        return this.canForum(actor, 'thread.viewOthers', target)
      }
      case 'thread.viewOthers':
        return (
          forum.canViewThreads === true &&
          (target.isForumModerator === true || forum.canViewOthersThreads === true)
        )
      case 'forum.search':
        return forum.canSearch === true
      case 'forum.subscribe':
        return forum.canSubscribe === true
      case 'thread.post':
        return forum.canPostThreads === true
      case 'reply.post':
        return forum.canPostReplies === true
      case 'poll.post':
        return forum.canPostPolls === true
      case 'poll.vote':
        return forum.canVotePolls === true
      case 'thread.rate':
        return forum.canRateThreads === true
      case 'attachment.upload':
        return forum.canUploadAttachments === true
      case 'attachment.download':
        return forum.canDownloadAttachments === true
      case 'post.editOwn':
        return ownsContent && forum.canEditOwnPosts === true
      case 'post.deleteOwn':
        return ownsContent && forum.canDeleteOwnPosts === true
      case 'post.editOthers':
        return (
          (target.moderatorRights?.canEditPosts === true || forum.canEditOthersPosts === true) &&
          !ownsContent
        )
      case 'post.softDelete':
        return (
          target.moderatorRights?.canSoftDeletePosts === true || forum.canSoftDeletePosts === true
        )
      case 'post.restore':
        return target.moderatorRights?.canRestorePosts === true || forum.canSoftDeletePosts === true
      case 'content.viewUnapproved':
        return target.isForumModerator === true || forum.canViewUnapproved === true
      case 'content.viewDeleted':
        return target.isForumModerator === true || forum.canViewDeleted === true
      case 'content.approve':
        return (
          target.moderatorRights?.canApproveContent === true || forum.canApproveContent === true
        )

      case 'thread.lock':
        return target.moderatorRights?.canOpenCloseThreads === true
      case 'thread.stick':
        return target.moderatorRights?.canStickThreads === true
      case 'thread.move':
        return target.moderatorRights?.canMoveThreads === true
      case 'thread.delete':
        return (
          target.moderatorRights?.canSoftDeletePosts === true ||
          (ownsThread && forum.canDeleteOwnThreads === true)
        )
      case 'thread.restore':
        return target.moderatorRights?.canRestorePosts === true
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
      case 'avatar.upload':
        return actor.global.canUploadAvatar === true
      case 'content.report':
        return actor.global.canReportContent === true
      case 'user.warn':
        return actor.global.canWarnUsers === true
      case 'reputation.give':
        return actor.global.canGiveReputation === true
      case 'signature.use':
        return actor.global.canUseSignature === true
      case 'modcp.access':
        return actor.global.canAccessModCp === true
      case 'admincp.access':
        return actor.global.canAccessAdminCp === true
      case 'flood.bypass':
        return actor.global.canBypassFloodCheck === true
      case 'board.viewOffline':
        return actor.global.canViewBoardOffline === true
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

function isReadAction(action: Action): boolean {
  return (
    action === 'forum.view' ||
    action === 'thread.view' ||
    action === 'thread.viewOthers' ||
    action === 'forum.search' ||
    action === 'profile.view' ||
    action === 'memberlist.view'
  )
}

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
