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
