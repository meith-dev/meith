'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError } from '@meith/core'
import { canHoldThreads } from '@meith/forums'
import { msg } from '@meith/i18n'
import { PollService } from '@meith/polls'

import { getContainer } from './container'
import { getActor } from './context'
import { emitEvent, viewerRef } from './plugin-view'

function id(form: FormData, name: string): number {
  const value = Number(form.get(name))
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new ValidationError(msg('error.app.poll-exist'))
  return value
}

export async function votePollAction(form: FormData): Promise<void> {
  const threadId = id(form, 'threadId')
  const pollId = id(form, 'pollId')
  const optionId = id(form, 'optionId')
  const actor = await getActor()
  const { authorizer, forums, polls, threads } = getContainer()
  if (polls === null || actor.userId === null)
    throw new ForbiddenError(msg('error.app.must-logged-vote'))
  const located = await threads.locate(threadId)
  const forumId = located?.forumId ?? null
  const forum = forumId === null ? null : await forums.findById(forumId)
  if (forumId === null || forum === null || !canHoldThreads(forum.type))
    throw new ValidationError(msg('error.app.poll-exist'))
  const target = {
    forumId,
    forum: await authorizer.forumMatrix(actor, forumId),
    threadAuthorId: located?.authorUserId ?? null,
  }
  if (!authorizer.can(actor, 'thread.view', target))
    throw new ValidationError(msg('error.app.poll-exist'))
  await new PollService(polls).vote({
    pollId,
    optionId,
    userId: actor.userId,
    mayVote: authorizer.can(actor, 'poll.vote', target),
  })
  await emitEvent('poll.voted', { pollId, optionId }, viewerRef(actor))
  redirect(`/thread/${threadId}`)
}
