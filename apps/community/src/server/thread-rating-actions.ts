'use server'

import { redirect } from 'next/navigation'
import { ForbiddenError, ValidationError } from '@meith/core'
import { ThreadRatingService } from '@meith/polls'
import { getContainer } from './container'
import { getActor } from './context'
import { getSettings } from './settings'

const number = (form: FormData, name: string) => {
  const value = Number(form.get(name))
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new ValidationError('That thread does not exist.')
  return value
}

export async function rateThreadAction(form: FormData): Promise<void> {
  const threadId = number(form, 'threadId')
  const rating = Number(form.get('rating'))
  const actor = await getActor()
  const { authorizer, communities, polls, threads } = getContainer()
  if (actor.userId === null || polls === null)
    throw new ForbiddenError('You must be logged in to rate a thread.')
  const communityId = await threads.locateCommunity(threadId)
  const community = communityId === null ? null : await communities.findById(communityId)
  /*
   * `communityId` is tested as well as `community`, and not only to satisfy the
   * compiler: the scope below is what every permission check reads, and a null
   * community id would resolve a matrix for "no community" — which grants the group
   * defaults with no per-community override applied. Narrowing `community` alone left
   * `communityId` nullable, and the two must fail together.
   */
  if (communityId === null || community === null || community.type !== 'community')
    throw new ValidationError('That thread does not exist.')
  const target = {
    communityId,
    community: await authorizer.communityMatrix(actor, communityId),
  }
  if (!authorizer.can(actor, 'thread.view', target))
    throw new ValidationError('That thread does not exist.')
  await new ThreadRatingService(polls).rate({
    threadId,
    userId: actor.userId,
    rating,
    enabled:
      (await getSettings()).get('posting.thread_ratings_enabled') &&
      authorizer.can(actor, 'thread.rate', target),
  })
  redirect(`/thread/${threadId}`)
}
