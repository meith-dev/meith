import 'server-only'

/**
 * F54 — who may open the moderator control panel, and what they see in it.
 *
 * One module because every ModCP route asks the same two questions and getting
 * a different answer on one of them is how a section appears in the navigation
 * and 404s when clicked.
 *
 * **The panel is rights-aware rather than permission-gated.** `modcp.access` is
 * a usergroup column and it is *not* the only route in: a member appointed to
 * moderate one forum has work to do and no group grant, which is exactly the
 * case F48 discovered `forum_moderators` had never been read for. So the gate is
 * "holds `modcp.access` **or** moderates at least one forum", and the sections
 * inside it are filtered by what that resolves to.
 */
import {
  hasAnyModeratorRight,
  type Actor,
  type ModeratorRights,
} from '@meith/authorization'

import { getActor } from './context'
import { getContainer } from './container'

/** What the panel offers this actor. */
export interface ModCpAccess {
  readonly actor: Actor
  readonly userId: number
  /** Forums they moderate, in tree order. Possibly empty for group-level staff. */
  readonly forumIds: readonly number[]
  /** Whether they hold the group-level panel permission. */
  readonly hasGroupAccess: boolean
  /** F53's global warn permission — the warn section. */
  readonly canWarn: boolean
  /**
   * Whether they may look up addresses.
   *
   * Deliberately a separate answer from panel access: seeing the queue and
   * asking "who else posts from this address" are different powers, and the
   * second reads personal data about somebody who has done nothing wrong. Held
   * by staff groups only — `isSuperModerator` or `isAdministrator` — because
   * there is no per-group column for it and inventing one would mean a
   * migration to grant a power nobody has asked for yet.
   */
  readonly canLookUpIp: boolean
}

/**
 * Resolve panel access for this request, or `null` when there is none.
 *
 * `null` rather than a thrown error so every route can answer with `notFound()`:
 * the existence of a moderator panel is not something to confirm to somebody who
 * may not open it, which is the same answer F48's queue gives.
 */
export async function resolveModCpAccess(): Promise<ModCpAccess | null> {
  const actor = await getActor()
  const { authorizer, modcp } = getContainer()

  /* Fixture mode has no panel: every section would list nothing (D38/D32). */
  if (modcp === null || actor.userId === null) return null

  const hasGroupAccess = authorizer.can(actor, 'modcp.access')
  const forumIds = await authorizer.moderatedForumIds(actor)
  if (!hasGroupAccess && forumIds.length === 0) return null

  return {
    actor,
    userId: actor.userId,
    forumIds,
    hasGroupAccess,
    canWarn: getContainer().warnings !== null && authorizer.can(actor, 'user.warn'),
    canLookUpIp:
      actor.global.isAdministrator === true || actor.global.isSuperModerator === true,
  }
}

/** One forum this actor moderates, with the rights they hold there. */
export interface ModeratedForumRights {
  readonly forumId: number
  readonly title: string
  readonly slug: string
  readonly rights: readonly string[]
}

/** How each `ModeratorRights` field reads on the dashboard. */
const RIGHT_LABELS: Readonly<Record<keyof ModeratorRights, string>> = {
  canApproveContent: 'Approve content',
  canEditPosts: 'Edit posts',
  canSoftDeletePosts: 'Delete and restore',
  canRestorePosts: 'Restore posts',
  canOpenCloseThreads: 'Lock and unlock',
  canStickThreads: 'Pin and unpin',
  canMoveThreads: 'Move threads',
  canMergeThreads: 'Merge threads',
  canSplitThreads: 'Split threads',
}

/**
 * The forums this actor moderates, with their granular rights in each.
 *
 * One `moderatorRightsIn` call per forum, which is the honest cost of a screen
 * whose subject *is* per-forum rights: the alternative is a batched read whose
 * combination rules would be a second implementation of the one in
 * `@meith/authorization` (R4). A moderator has a handful of forums, not a
 * hundred — and the dashboard's *counts* are one query for all of them, which is
 * the part that would otherwise be an N+1.
 */
export async function moderatedForumRights(
  access: ModCpAccess,
): Promise<readonly ModeratedForumRights[]> {
  const { authorizer, forums } = getContainer()
  const rows = await forums.listListing()

  const resolved = await Promise.all(
    access.forumIds.map(async (forumId): Promise<ModeratedForumRights | null> => {
      const row = rows.find((r) => r.id === forumId)
      if (row === undefined || row.type !== 'forum') return null
      const rights = await authorizer.moderatorRightsIn(access.actor, forumId)
      return {
        forumId,
        title: row.title,
        slug: row.slug,
        rights: (Object.keys(RIGHT_LABELS) as (keyof ModeratorRights)[])
          .filter((key) => rights[key])
          .map((key) => RIGHT_LABELS[key]),
      }
    }),
  )

  return resolved.filter((row): row is ModeratedForumRights => row !== null)
}

/**
 * The `Target` a per-page `can()` call should be built with (F54's debt).
 *
 * F48 introduced `Target.isForumModerator` and recorded that nothing ever set
 * it, so outside the queue a per-forum appointee had only their group's rights —
 * `post.editOthers`, `post.softDelete` and the two content-visibility actions
 * all read the flag and all saw `undefined`. F52 paid half of it inside the
 * inline-moderation scope; this is the other half, and it is a helper rather
 * than a copied three-line block precisely because there are four call sites.
 */
export async function moderatorTargetFor(
  actor: Actor,
  forumId: number,
  forum: Awaited<ReturnType<ReturnType<typeof getContainer>['authorizer']['forumMatrix']>>,
): Promise<{
  forumId: number
  forum: typeof forum
  moderatorRights: ModeratorRights
  isForumModerator: boolean
}> {
  const { authorizer } = getContainer()
  const moderatorRights = await authorizer.moderatorRightsIn(actor, forumId)
  return {
    forumId,
    forum,
    moderatorRights,
    isForumModerator: hasAnyModeratorRight(moderatorRights),
  }
}
