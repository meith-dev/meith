'use server'

import { revalidatePath } from 'next/cache'

import { ForbiddenError } from '@meith/core'
import { msg } from '@meith/i18n'

import type { FormState } from './auth-form-state'
import { EMPTY_STATE } from './auth-form-state'
import { getActor } from './context'
import { formStateReporter } from './form-state-reporter'
import { positiveInt } from './form-values'
import { requireMessaging } from './messages'
import { notificationService } from './notifications'

const toFormState = formStateReporter(
  'notification-menu-actions',
  'unexpected error in the notifications menu',
)

function refreshShell(): void {
  revalidatePath('/', 'layout')
}

export async function markNotificationSeenAction(
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const notificationId = positiveInt(form, 'notificationId')
  if (notificationId === null) return EMPTY_STATE

  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))

    const service = notificationService()
    if (service !== null) await service.markRead(actor.userId, notificationId)
  } catch (err) {
    return toFormState(err)
  }

  refreshShell()
  return EMPTY_STATE
}

export async function markAllNotificationsSeenAction(
  _prev: FormState,
  _form: FormData,
): Promise<FormState> {
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))

    const service = notificationService()
    if (service !== null) await service.markAllRead(actor.userId)
  } catch (err) {
    return toFormState(err)
  }

  refreshShell()
  return EMPTY_STATE
}

export async function markMessagesSeenAction(_prev: FormState, form: FormData): Promise<FormState> {
  const copyIds = form
    .getAll('copyId')
    .filter((value): value is string => typeof value === 'string')
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)

  if (copyIds.length === 0) return EMPTY_STATE

  try {
    const { service, userId } = await requireMessaging(await getActor())
    await service.markRead(userId, copyIds)
  } catch (err) {
    return toFormState(err)
  }

  refreshShell()
  return EMPTY_STATE
}
