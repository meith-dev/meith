import type { ActorSource, Authorizer } from '@meith/authorization'
import { logger, NO_THREAD_AUDIENCE } from '@meith/core'
import type { SubscriberAudienceSource } from '@meith/subscriptions'

export function visibleForumSource(deps: {
  readonly authorizer: Authorizer
  readonly actors: ActorSource
}): SubscriberAudienceSource {
  const log = logger({ module: 'subscriptions' })

  return {
    async audienceFor(userId) {
      try {
        const actor = await deps.actors.buildForUser(userId)
        if (actor === null) return NO_THREAD_AUDIENCE
        return await deps.authorizer.threadAudience(actor)
      } catch (err) {
        log.warn({ err, userId }, 'could not resolve the thread audience for a subscriber')
        return NO_THREAD_AUDIENCE
      }
    },
  }
}
