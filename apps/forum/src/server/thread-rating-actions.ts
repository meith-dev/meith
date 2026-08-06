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
  const { authorizer, forums, polls, threads } = getContainer()
  if (actor.userId === null || polls === null)
    throw new ForbiddenError('You must be logged in to rate a thread.')
  const forumId = await threads.locateForum(threadId)
  const forum = forumId === null ? null : await forums.findById(forumId)
  if (forumId === null || forum === null || forum.type !== 'forum')
    throw new ValidationError('That thread does not exist.')
  const target = {
    forumId,
    forum: await authorizer.forumMatrix(actor, forumId),
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
