'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError } from '@meith/core'
import { ModerationQueue, parseSelection } from '@meith/moderation'

import { recordAdminAction } from './admin'
import { avatarService } from './avatars'
import { getActor } from './context'
import { getContainer } from './container'
import type { FormState } from './auth-form-state'
import { formStateReporter } from './form-state-reporter'

const toFormState = formStateReporter('moderation-actions', 'unexpected error in the queue')

function outcomeQuery(outcome: {
  decision: string
  applied: number
  refused: number
  missing: number
}): string {
  const parts = [`did=${outcome.decision}`, `n=${outcome.applied}`]
  if (outcome.refused > 0) parts.push(`refused=${outcome.refused}`)
  if (outcome.missing > 0) parts.push(`gone=${outcome.missing}`)
  return parts.join('&')
}

export async function moderateQueueAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const decision = form.get('decision')
  if (decision !== 'approve' && decision !== 'reject') {
    return { error: 'Choose approve or reject.' }
  }

  const { authorizer, moderationQueue } = getContainer()
  if (moderationQueue === null) {
    return {
      error: 'This board is running on in-memory sample data, so it has no queue.',
    }
  }

  let outcome
  try {
    const actor = await getActor()
    if (actor.userId === null) {
      throw new ForbiddenError('You must be logged in to moderate.')
    }

    const moderated = new Set(await authorizer.moderatedForumIds(actor))
    if (moderated.size === 0) {
      throw new ForbiddenError('You do not moderate any forums.')
    }

    const selection = parseSelection(
      form.getAll('item').filter((v): v is string => typeof v === 'string'),
    )
    if (selection.length === 0) {
      throw new ValidationError('Select at least one item.')
    }

    outcome = await new ModerationQueue({ queue: moderationQueue }).decide({
      selection,
      decision,
      moderatedForumIds: moderated,
      actorUserId: actor.userId,
    })
  } catch (err) {
    return toFormState(err)
  }

  redirect(`/moderation?${outcomeQuery(outcome)}`)
}

export async function setSignatureLockAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const text = (name: string): string => {
    const value = form.get(name)
    return typeof value === 'string' ? value.trim() : ''
  }

  const userId = Number(text('userId'))
  const returnTo = userId > 0 ? `/member/${userId}` : '/'

  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError('You must be logged in.')
    getContainer().authorizer.require(actor, 'user.warn')

    const store = getContainer().signatures
    if (store === null) {
      throw new ForbiddenError('This board keeps no signatures.')
    }
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new ValidationError('No such member.')
    }

    const locked = form.get('locked') === '1'
    const reason = text('reason')

    if (locked && reason === '') {
      throw new ValidationError('Say why. The member is shown this reason.')
    }

    await store.setLocked({ userId, locked, reason: locked ? reason : null })
    await recordAdminAction({
      action: locked ? 'signature.lock' : 'signature.unlock',
      detail: { userId },
    })
  } catch (err) {
    return toFormState(err)
  }

  redirect(`${returnTo}?signature=${form.get('locked') === '1' ? 'locked' : 'unlocked'}`)
}

export async function setAvatarLockAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const text = (name: string): string => {
    const value = form.get(name)
    return typeof value === 'string' ? value.trim() : ''
  }

  const userId = Number(text('userId'))
  const returnTo = userId > 0 ? `/member/${userId}` : '/'

  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError('You must be logged in.')
    getContainer().authorizer.require(actor, 'user.warn')

    const service = avatarService()
    if (service === null) throw new ForbiddenError('This board keeps no avatars.')
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new ValidationError('No such member.')
    }

    const locked = form.get('locked') === '1'
    await service.setLock({ userId, locked, reason: text('reason') })
    await recordAdminAction({
      action: locked ? 'avatar.lock' : 'avatar.unlock',
      detail: { userId },
    })
  } catch (err) {
    return toFormState(err)
  }

  redirect(`${returnTo}?avatar=${form.get('locked') === '1' ? 'locked' : 'unlocked'}`)
}
