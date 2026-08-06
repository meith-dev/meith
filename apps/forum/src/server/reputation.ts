import 'server-only'

import type { RaterLimits, ReputationSettings } from '@meith/reputation'
import { ReputationService } from '@meith/reputation'

import { getContainer } from './container'
import { getActor } from './context'
import { getSettings } from './settings'

export function reputationService(): ReputationService | null {
  const { reputation } = getContainer()
  return reputation === null ? null : new ReputationService({ reputation })
}

export async function reputationSettings(): Promise<ReputationSettings> {
  const settings = await getSettings()
  return {
    enabled: settings.get('reputation.enabled'),
    allowNegative: settings.get('reputation.allow_negative'),
    commentRequired: settings.get('reputation.comment_required'),
    minPostsToGive: settings.get('reputation.min_posts_to_give'),
  }
}

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

export interface PostThanks {
  readonly thanked: boolean
  readonly count: number
}

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
        thanked: (mine.get(postId)?.points ?? 0) > 0,
        count: counts.get(postId) ?? 0,
      },
    ]),
  )
}
