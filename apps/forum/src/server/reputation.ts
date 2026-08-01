import 'server-only'

/**
 * F62 — the app's one way to reach reputation.
 *
 * Three things live here: the service, the **board settings** it needs, and the
 * **per-group limits** for whoever is rating.
 *
 * The limits are where F20's rule shows up: `@forum/reputation` knows nothing
 * about groups, so "may this member rate" and "how many a day" are asked
 * through the Authorizer — `can(actor, 'reputation.give')` for the boolean and
 * `globalLimit` for the number — and handed over as plain values.
 */
import type { RaterLimits, ReputationSettings } from '@forum/reputation'
import { ReputationService } from '@forum/reputation'

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
