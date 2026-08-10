import type { ActorSource, Authorizer } from '@meith/authorization'
import { logger } from '@meith/core'
import type { VisibleForumSource } from '@meith/subscriptions'

export function visibleForumSource(deps: {
  readonly authorizer: Authorizer
  readonly actors: ActorSource
}): VisibleForumSource {
  const log = logger({ module: 'subscriptions' })

  return {
    async visibleForumIdsFor(userId) {
      try {
        const actor = await deps.actors.buildForUser(userId)
        if (actor === null) return []
        return await deps.authorizer.visibleForumIds(actor)
      } catch (err) {
        log.warn({ err, userId }, 'could not resolve visible forums for a subscriber')
        return []
      }
    },
  }
}
