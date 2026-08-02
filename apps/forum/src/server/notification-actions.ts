'use server'

/**
 * F55 — the notification centre's Server Actions.
 *
 * Three verbs, all of them acting on the caller's *own* rows, which makes the
 * authorisation shape different from every moderator action in Phase 4: there
 * is no matrix to resolve and no appointment to read, because there is nothing
 * here anybody could be granted over somebody else.
 *
 * What replaces it is scoping. The signed-in user id goes into the WHERE clause
 * rather than being checked after a read, so "not yours" and "does not exist"
 * are one answer — without that, marking notifications read is a counter for
 * how many the board has ever written.
 *
 * All three are POSTs from native forms. Marking something read is a state
 * change, and a GET that mutates is fired by every prefetcher and link scanner
 * that touches the page — the same reason F27's log out is a form.
 */
import { redirect } from 'next/navigation'

import { ForbiddenError, isAppError, logger } from '@forum/core'
import type { NotificationService } from '@forum/notifications'

import { getActor } from './context'
import { audiencesForActor } from './notification-audience'
import { notificationService } from './notifications'
import type { FormState } from './auth-form-state'

function toFormState(err: unknown): FormState {
  if (isAppError(err)) return { error: err.message }
  logger({ module: 'notification-actions' }).error({ err }, 'unexpected error in notifications')
  return { error: 'Something went wrong. Please try again.' }
}

function positiveInt(form: FormData, name: string): number | null {
  const value = form.get(name)
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const n = Number(value)
  return Number.isSafeInteger(n) ? n : null
}

/** Every action here needs the same two things, and neither may be assumed. */
async function requireOwnCentre(): Promise<{
  service: NotificationService
  userId: number
}> {
  const actor = await getActor()
  if (actor.userId === null) throw new ForbiddenError('You must be logged in.')

  const service = notificationService()
  if (service === null) {
    throw new ForbiddenError(
      'This board is running on in-memory sample data, so it has no notifications.',
    )
  }
  return { service, userId: actor.userId }
}

export async function markNotificationReadAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const notificationId = positiveInt(form, 'notificationId')
  if (notificationId === null) return { error: 'That notification does not exist.' }

  try {
    const { service, userId } = await requireOwnCentre()
    /*
     * The return value is deliberately ignored. "Already read" and "not yours"
     * both come back false, and telling them apart on screen would be the
     * disclosure the scoped statement exists to prevent.
     */
    await service.markRead(userId, notificationId)
  } catch (err) {
    return toFormState(err)
  }

  redirect('/notifications?read=one')
}

export async function markAllNotificationsReadAction(
  _prev: FormState,
  _form: FormData,
): Promise<FormState> {
  try {
    const { service, userId } = await requireOwnCentre()
    await service.markAllRead(userId)
  } catch (err) {
    return toFormState(err)
  }

  redirect('/notifications?read=all')
}

/**
 * Save the preferences screen.
 *
 * An unchecked checkbox submits *nothing*, so "off" cannot be read from the
 * form — it is reconstructed from the registry, for the audience whose screen
 * was rendered. The audience is resolved here from the actor rather than taken
 * from the form, because a member submitting `audience=staff` would otherwise
 * write rows for kinds they can never receive.
 */
export async function saveNotificationPreferencesAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    const { service, userId } = await requireOwnCentre()
    const checked = form
      .getAll('email')
      .filter((value): value is string => typeof value === 'string')

    /*
     * One save per audience the *actor* is entitled to, resolved from the actor
     * and never from the form. `savePreferences` writes exactly the audience it
     * is handed, so a member submitting `system.task_failed` writes nothing:
     * the kind is not in their audience's list and the set is built from the
     * registry, not from the submission.
     */
    for (const audience of await audiencesForActor()) {
      await service.savePreferences(userId, audience, checked)
    }
  } catch (err) {
    return toFormState(err)
  }

  redirect('/notifications/preferences?saved=1')
}
