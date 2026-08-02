'use server'

/**
 * F48 — the queue's Server Action.
 *
 * The same adapter shape the posting actions use: read `FormData`, resolve who
 * is asking, re-authorise, call the domain command, redirect. What is different
 * is *what* gets re-authorised — not a forum named in the form, but the forum
 * each selected item turns out to be in, which only the database knows.
 *
 * Works with JavaScript disabled: native checkboxes, two submit buttons whose
 * `name`/`value` carry the decision, and a redirect back to the queue.
 */
import { redirect } from 'next/navigation'

import { ForbiddenError, ValidationError, isAppError, logger } from '@forum/core'
import { ModerationQueue, parseSelection } from '@forum/moderation'

import { avatarService } from './avatars'
import { getActor } from './context'
import { getContainer } from './container'
import type { FormState } from './auth-form-state'

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'moderation-actions' }).error({ err }, 'unexpected error in the queue')
  return { error: 'Something went wrong. Please try again.' }
}

/**
 * A short summary of what happened, in the query string.
 *
 * Counts rather than a bare "done": a moderator who selected twelve items and
 * moved eleven has to be told, or the screen and the board disagree about what
 * they just did and only one of them is right.
 */
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

    /*
     * Resolved fresh for this request rather than carried in the form. The set
     * is the authorisation, so a hidden field holding it would be the whole
     * permission check sitting in the browser.
     */
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

/**
 * F58 — lock or unlock somebody's signature.
 *
 * The "moderated" half of F58's acceptance. A lock rather than a delete: an
 * emptied signature can be retyped the next minute and says nothing about why,
 * while a locked one keeps the text — so an appeal can see what was actually
 * there — and stops it rendering and stops the member editing it.
 *
 * Gated on `user.warn` rather than a new permission. Both are aimed at a
 * *person* rather than at a forum's content, and a board that trusts somebody
 * to warn a member trusts them to stop that member's signature; inventing a
 * second switch would give an administrator two answers to one question.
 */
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
      /*
       * Required, because "your signature has been locked" with no reason is
       * how somebody concludes the board is broken rather than that they broke
       * a rule — and the member is shown this text on their own screen.
       */
      throw new ValidationError('Say why. The member is shown this reason.')
    }

    await store.setLocked({ userId, locked, reason: locked ? reason : null })
  } catch (err) {
    return toFormState(err)
  }

  redirect(`${returnTo}?signature=${form.get('locked') === '1' ? 'locked' : 'unlocked'}`)
}


/**
 * F58 — lock or unlock somebody's avatar.
 *
 * The same act on the other half, and gated the same way and for the same
 * reason: `user.warn`, because both are aimed at a *person* rather than at a
 * forum's content, and inventing a second switch would give an administrator
 * two answers to one question.
 *
 * A lock and not a delete, again — but here the argument is stronger rather
 * than merely parallel. Deleting an avatar destroys the evidence: an appeal
 * about a signature can read the text that was kept, and an appeal about an
 * image has nothing at all unless the object survives. So the lock stops it
 * rendering, stops the member replacing it, and keeps the file.
 */
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

    await service.setLock({
      userId,
      locked: form.get('locked') === '1',
      reason: text('reason'),
    })
  } catch (err) {
    return toFormState(err)
  }

  redirect(`${returnTo}?avatar=${form.get('locked') === '1' ? 'locked' : 'unlocked'}`)
}
