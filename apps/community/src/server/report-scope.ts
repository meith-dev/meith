import 'server-only'

/**
 * F49 — which reports an actor may see, resolved once.
 *
 * Two sets, because reports have two scopes. A report about a post or a thread
 * belongs to that forum's moderators; a report about a *member* belongs to no
 * forum, so it is board staff's or it is nobody's.
 *
 * Not a Server Action module: a `'use server'` file publishes every export as a
 * callable endpoint, and this one hands back a permission decision.
 */
import type { ReportScope } from '@meith/moderation'

import { getActor } from './context'
import { getContainer } from './container'

export async function resolveReportScope(): Promise<ReportScope> {
  const actor = await getActor()
  const { authorizer } = getContainer()
  if (actor.userId === null) return { forumIds: [], global: false }

  return {
    forumIds: await authorizer.moderatedForumIds(actor),
    /*
     * `modcp.access` rather than a new permission. A report about a member is
     * board-wide by nature, and the board already has a field for "this person
     * is staff" — inventing a second one would give an administrator two
     * switches for one decision.
     */
    global: authorizer.can(actor, 'modcp.access'),
  }
}

/** True when this actor has any report surface at all. */
export function hasReportScope(scope: ReportScope): boolean {
  return scope.forumIds.length > 0 || scope.global
}
