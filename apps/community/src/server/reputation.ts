import 'server-only'

/**
 * F62 — the app's one way to reach reputation.
 *
 * Three things live here: the service, the **board settings** it needs, and the
 * **per-group limits** for whoever is rating.
 *
 * The limits are where F20's rule shows up: `@meith/reputation` knows nothing
 * about groups, so "may this member rate" and "how many a day" are asked
 * through the Authorizer — `can(actor, 'reputation.give')` for the boolean and
 * `globalLimit` for the number — and handed over as plain values.
 */
import type { RaterLimits, ReputationSettings } from '@meith/reputation'
import { ReputationService } from '@meith/reputation'

import { getContainer } from './container'
import { getActor } from './context'
import { getSettings } from './settings'

/** The service, or `null` on a board with no reputation store (fixture mode). */
export function reputationService(): ReputationService | null {
  const { reputation } = getContainer()
  return reputation === null ? null : new ReputationService({ reputation })
}

/** What the board has decided, read from F08's registry. */
export async function reputationSettings(): Promise<ReputationSettings> {
  const settings = await getSettings()
  return {
    enabled: settings.get('reputation.enabled'),
    allowNegative: settings.get('reputation.allow_negative'),
    commentRequired: settings.get('reputation.comment_required'),
    minPostsToGive: settings.get('reputation.min_posts_to_give'),
  }
}

/**
 * What the *viewer* may do, resolved from their groups and their post count.
 *
 * The post count comes from `users.post_count`, which F38 keeps correct — the
 * floor is a spam defence, and reading it from a counter a member cannot
 * influence except by posting is the whole point.
 *
 * A guest, and anybody whose account cannot be read, gets `canGive: false`.
 * Failing closed is the only safe direction for a capability.
 */
export async function viewerRaterLimits(): Promise<RaterLimits> {
  const actor = await getActor()
  const { authorizer, memberProfiles } = getContainer()

  if (actor.userId === null) return { canGive: false, maxPerDay: 0, postCount: 0 }

  const profile = await memberProfiles.findPublicById(actor.userId).catch(() => null)

  return {
    canGive: authorizer.can(actor, 'reputation.give'),
    maxPerDay: authorizer.globalLimit(actor, 'maxReputationPerDay'),
    postCount: profile?.postCount ?? 0,
  }
}

/** What a post's Thanks control needs to know before it renders. */
export interface PostThanks {
  /** Whether *this* reader has already thanked it. */
  readonly thanked: boolean
  /** How many people have, this reader included. */
  readonly count: number
}

/**
 * Resolve the Thanks state for a page of posts, in at most two queries.
 *
 * Two rather than one because they are two different questions asked of two
 * different scopes — "how many people" is an aggregate over everybody, "have
 * *I*" is scoped to the reader in its own `where` clause. Joining them would
 * mean one query that has to be read carefully to see that the second scope is
 * still there, and this board's rule is that ownership lives in the query
 * rather than in a filter applied to the result.
 *
 * Neither is asked for a guest: they cannot rate, so the control is not
 * offered, so its state is not needed. Failure is an empty map rather than an
 * exception — a thread page is not worth failing over a button.
 */
export async function thanksForPosts(
  postIds: readonly number[],
): Promise<ReadonlyMap<number, PostThanks>> {
  const service = reputationService()
  if (service === null || postIds.length === 0) return new Map()

  const actor = await getActor()

  const [counts, mine] = await Promise.all([
    service.thanksForPosts(postIds).catch(() => new Map<number, number>()),
    actor.userId === null
      ? Promise.resolve(new Map())
      : service
          .existingForPosts({ givenByUserId: actor.userId, postIds })
          .catch(() => new Map()),
  ])

  return new Map(
    postIds.map((postId) => [
      postId,
      {
        /*
         * Positive only. A member who left a *negative* rating on this post has
         * not thanked it, and a control reading "Thanked" over their own
         * criticism would be the board putting words in their mouth.
         */
        thanked: (mine.get(postId)?.points ?? 0) > 0,
        count: counts.get(postId) ?? 0,
      },
    ]),
  )
}
