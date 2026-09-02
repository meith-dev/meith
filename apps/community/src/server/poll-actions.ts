'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'
import { type PollEditOption, PollService } from '@meith/polls'

import { type PollVoteView, pollVoteView } from '@/view/poll-vote'
import { isEnhancedSubmit } from '@/view/progressive-enhancement'

import { getContainer } from './container'
import { getActor } from './context'
import { emitEvent, viewerRef } from './plugin-view'
import { resolvePollScope } from './poll-scope'

function id(form: FormData, name: string): number {
  const value = Number(form.get(name))
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new ValidationError(msg('error.app.poll-exist'))
  return value
}

function optionIds(form: FormData): readonly number[] {
  return form
    .getAll('optionId')
    .map((value) => Number(value))
    .filter((value) => Number.isSafeInteger(value) && value > 0)
}

function text(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

function closingTime(form: FormData): Date | null {
  const value = text(form, 'closesAt').trim()
  if (value === '') return null

  const at = new Date(`${value}Z`)
  if (Number.isNaN(at.getTime())) throw new ValidationError(msg('error.app.valid-date'))
  return at
}

function editedOptions(form: FormData): readonly PollEditOption[] {
  const labels = form.getAll('optionLabel')
  return form.getAll('optionRef').flatMap((reference, index) => {
    const label = labels[index]
    if (typeof label !== 'string') return []
    const raw = Number(reference)
    const existing = Number.isSafeInteger(raw) && raw > 0 ? raw : null
    return [{ id: existing, label }]
  })
}

export async function votePollAction(
  _prev: PollVoteView | null,
  form: FormData,
): Promise<PollVoteView | null> {
  const threadId = id(form, 'threadId')
  const pollId = id(form, 'pollId')
  const actor = await getActor()
  const { polls } = getContainer()
  if (polls === null || actor.userId === null)
    throw new ForbiddenError(msg('error.app.must-logged-vote'))

  const scope = await resolvePollScope(actor, threadId)
  if (scope === null) throw new ValidationError(msg('error.app.poll-exist'))

  const chosen = optionIds(form)
  await new PollService(polls).vote({
    threadId,
    pollId,
    optionIds: chosen,
    userId: actor.userId,
    mayVote: scope.mayVote,
  })
  for (const optionId of chosen) {
    await emitEvent('poll.voted', { pollId, optionId }, viewerRef(actor))
  }

  if (isEnhancedSubmit(form)) {
    const fresh = await polls.find(threadId, actor.userId)
    return fresh === null ? null : pollVoteView(fresh, scope.mayVote, new Date())
  }

  redirect(`/thread/${threadId}`)
}

export async function editPollAction(form: FormData): Promise<void> {
  const threadId = id(form, 'threadId')
  const pollId = id(form, 'pollId')
  const actor = await getActor()
  const { polls } = getContainer()
  if (polls === null || actor.userId === null)
    throw new ForbiddenError(msg('error.app.must-logged-vote'))

  const scope = await resolvePollScope(actor, threadId)
  if (scope === null) throw new ValidationError(msg('error.app.poll-exist'))

  await new PollService(polls).edit({
    threadId,
    pollId,
    edit: {
      question: text(form, 'question'),
      options: editedOptions(form),
      closesAt: closingTime(form),
      maxOptions: Number(text(form, 'maxOptions')),
      allowRevote: form.get('allowRevote') !== null,
      publicVotes: form.get('publicVotes') !== null,
    },
    capabilities: scope.capabilities,
  })

  redirect(`/thread/${threadId}`)
}
