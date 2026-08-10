'use server'

import { redirect } from 'next/navigation'

import { ForbiddenError, isAppError, logger } from '@meith/core'
import type { NotificationService } from '@meith/notifications'

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
    const checked = form
      .getAll('email')
      .filter((value): value is string => typeof value === 'string')

    for (const audience of await audiencesForActor()) {
      await service.savePreferences(userId, audience, checked)
    }
  } catch (err) {
    return toFormState(err)
  }

  redirect('/notifications/preferences?saved=1')
}
