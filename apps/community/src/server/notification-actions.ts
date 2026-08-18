'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError } from '@meith/core'
import { msg } from '@meith/i18n'
import type { NotificationService } from '@meith/notifications'

import type { FormState } from './auth-form-state'
import { getActor } from './context'
import { formStateReporter } from './form-state-reporter'
import { positiveInt } from './form-values'
import { tr } from './i18n'
import { audiencesForActor } from './notification-audience'
import { notificationService } from './notifications'
import { pushAvailability } from './push'

const toFormState = formStateReporter('notification-actions', 'unexpected error in notifications')

async function requireOwnCentre(): Promise<{
  service: NotificationService
  userId: number
}> {
  const actor = await getActor()
  if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))

  const service = notificationService()
  if (service === null) {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-16'))
  }
  return { service, userId: actor.userId }
}

export async function markNotificationReadAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const notificationId = positiveInt(form, 'notificationId')
  if (notificationId === null) return { error: await tr('notice.app.notification-exist') }

  try {
    const { service, userId } = await requireOwnCentre()
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

export async function saveNotificationPreferencesAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  try {
    const { service, userId } = await requireOwnCentre()
    const email = form.getAll('email').filter((value): value is string => typeof value === 'string')
    const push = form.getAll('push').filter((value): value is string => typeof value === 'string')
    const offersPush = (await pushAvailability()).enabled

    for (const audience of await audiencesForActor()) {
      await service.savePreferences(userId, audience, email, 'email')
      if (offersPush) await service.savePreferences(userId, audience, push, 'push')
    }
  } catch (err) {
    return toFormState(err)
  }

  redirect('/notifications/preferences?saved=1')
}
