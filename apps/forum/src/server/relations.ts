import 'server-only'

/**
 * F61 — the app's one way to reach buddy and ignore lists.
 *
 * The read that matters is `viewerIgnoredIds`, and it is cached per request:
 * every thread render needs it, and it is board state that cannot change
 * mid-render. Without the cache a fifteen-post page would ask fifteen times.
 *
 * The other thing here is where "is this person staff" is answered — through
 * the Authorizer, because `@meith/relations` has no idea what a group is (F20).
 * It is asked only when somebody is about to be *ignored*, so an ordinary page
 * render never pays for it.
 */
import { cache } from 'react'

import { RelationService } from '@meith/relations'

import { getContainer } from './container'
import { getActor } from './context'

/** The service, or `null` on a board with no relation store (fixture mode). */
export function relationService(): RelationService | null {
  const { relations } = getContainer()
  return relations === null ? null : new RelationService({ relations })
}

/**
 * The ids the *viewer* ignores, resolved once per request.
 *
 * Empty for a guest, for a board with no store, and — deliberately — when the
 * read fails. An ignore list that could not be loaded must not take down a
 * thread page: the failure mode is seeing a post you had hidden, which is
 * recoverable by reloading, and the alternative is a 500 on the board's most
 * visited screen.
 */
export const viewerIgnoredIds = cache(async (): Promise<ReadonlySet<number>> => {
  const service = relationService()
  const actor = await getActor()
  if (service === null || actor.userId === null) return new Set()

  try {
    return new Set(await service.ignoredIds(actor.userId))
  } catch {
    return new Set()
  }
})

/**
 * Whether this member is staff, for the "you cannot ignore a moderator" rule.
 *
 * `modcp.access` rather than a new permission: it is the board's existing
 * answer to "this person is staff", and a second switch for one decision is how
 * an administrator ends up with two.
 */
export async function isStaff(userId: number): Promise<boolean> {
  const { actorSource, authorizer } = getContainer()
  const actor = await actorSource.buildForUser(userId)
  if (actor === null) return false
  return authorizer.can(actor, 'modcp.access')
}

/**
 * How long between writes of `users.last_active_at`.
 *
 * Five minutes. Shorter than F61's fifteen-minute online window on purpose:
 * with a window equal to the throttle, somebody who kept the board open would
 * flicker offline for the last moments of every interval.
 */
const ACTIVITY_WINDOW_SECONDS = 300

/**
 * Record that a signed-in member is here.
 *
 * `users.last_active_at` has been in the schema since `0000` and had **no
 * writer** — read by the ModCP, by the profile and by nothing that set it. F61
 * is the first feature that needs it to be true, so this is where it becomes
 * true.
 *
 * The throttle lives in the repository's WHERE clause, so this is a conditional
 * UPDATE that usually matches nothing rather than a write per page view. It is
 * called from the page shell, which means a *prefetch* also counts as activity
 * — accepted, because a prefetch means the member has the board open in front
 * of them, which is what "online" is meant to convey.
 *
 * Never throws. Nothing on a page is worth failing for a presence column.
 */
export async function touchActivity(userId: number | null): Promise<void> {
  if (userId === null) return

  try {
    const { accountStore } = getContainer()
    await accountStore.accounts.touchLastActive(userId, new Date(), ACTIVITY_WINDOW_SECONDS)
  } catch {
    /* Deliberately swallowed. */
  }
}
