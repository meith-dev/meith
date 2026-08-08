/**
 * F56 — "which communities may this member still see", for a background job.
 *
 * The notifier needs the answer per member and cannot take a shortcut for it.
 * A subscription is not a standing grant: a community can be made private, a group
 * can lose `canView`, a thread can be moved somewhere its subscriber cannot
 * read — all after the subscription was created. Any of those means the member
 * must not be told what happened there, and the *only* place that question is
 * answered on this board is `Authorizer.visibleCommunityIds` (R4, F47).
 *
 * So this builds the member's `Actor` exactly as a request would and asks the
 * same Authorizer the same question. It costs one actor build plus F21's
 * constant three source reads per member (D26) — paid once per member per run,
 * which is the right place for it: the alternative is a second answer to the
 * visibility question living inside a task, and F47's whole argument is that
 * there is one answer and one place it comes from.
 *
 * A member whose actor cannot be built — deleted between the scan and the run —
 * sees nothing rather than everything. Failing closed is the only safe
 * direction when the question is "may they be told about this".
 */
import type { ActorSource, Authorizer } from '@meith/authorization'
import { logger } from '@meith/core'
import type { VisibleCommunitySource } from '@meith/subscriptions'

export function visibleCommunitySource(deps: {
  readonly authorizer: Authorizer
  readonly actors: ActorSource
}): VisibleCommunitySource {
  const log = logger({ module: 'subscriptions' })

  return {
    async visibleCommunityIdsFor(userId) {
      try {
        const actor = await deps.actors.buildForUser(userId)
        /*
         * Null means the account has gone — deleted between the scan that found
         * them and this run. Nothing, rather than the guest's visible set: a
         * deleted member is not a guest, they are somebody who should not be
         * notified at all.
         */
        if (actor === null) return []
        return await deps.authorizer.visibleCommunityIds(actor)
      } catch (err) {
        log.warn({ err, userId }, 'could not resolve visible communities for a subscriber')
        return []
      }
    },
  }
}
