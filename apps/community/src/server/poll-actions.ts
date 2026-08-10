'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError } from '@meith/core'
import { PollService } from '@meith/polls'

import { getContainer } from './container'
import { getActor } from './context'
import { canHoldThreads } from '@meith/forums'

function id(form: FormData, name: string): number {
  const value = Number(form.get(name))
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new ValidationError('That poll does not exist.')
  return value
}

export async function votePollAction(form: FormData): Promise<void> {
  const threadId = id(form, 'threadId')
  const pollId = id(form, 'pollId')
  const optionId = id(form, 'optionId')
  const actor = await getActor()
  const { authorizer, forums, polls, threads } = getContainer()
  if (polls === null || actor.userId === null)
    throw new ForbiddenError('You must be logged in to vote.')
  const forumId = await threads.locateForum(threadId)
  const forum = forumId === null ? null : await forums.findById(forumId)
  if (forumId === null || forum === null || !canHoldThreads(forum.type))
    throw new ValidationError('That poll does not exist.')
  const target = {
    forumId,
    forum: await authorizer.forumMatrix(actor, forumId),
  }
  if (!authorizer.can(actor, 'thread.view', target))
    throw new ValidationError('That poll does not exist.')
  await new PollService(polls).vote({
    pollId,
    optionId,
    userId: actor.userId,
    mayVote: authorizer.can(actor, 'poll.vote', target),
  })
  redirect(`/thread/${threadId}`)
}
