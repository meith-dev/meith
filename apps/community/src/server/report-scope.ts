import 'server-only'

import type { ReportScope } from '@meith/moderation'

import { getContainer } from './container'
import { getActor } from './context'

export async function resolveReportScope(): Promise<ReportScope> {
  const actor = await getActor()
  const { authorizer } = getContainer()
  if (actor.userId === null) return { forumIds: [], global: false }

  return {
    forumIds: await authorizer.moderatedForumIds(actor),
    global: authorizer.can(actor, 'modcp.access'),
  }
}

export function hasReportScope(scope: ReportScope): boolean {
  return scope.forumIds.length > 0 || scope.global
}
