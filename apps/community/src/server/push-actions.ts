'use server'

import { ForbiddenError, ValidationError } from '@meith/core'
import { msg } from '@meith/i18n'
import type { NotificationService } from '@meith/notifications'

import type { FormState } from './auth-form-state'
import { getActor } from './context'
import { formStateReporter } from './form-state-reporter'
import { tr } from './i18n'
import { notificationService } from './notifications'
import { pushAvailability } from './push'

const toFormState = formStateReporter('push-actions', 'unexpected error in web push')

const ENDPOINT_MAX = 1000

const SUBSCRIPTIONS_PER_USER_MAX = 20

const BASE64URL = /^[A-Za-z0-9_-]+$/

const IP_LITERAL = /^\[|^\d+\.\d+\.\d+\.\d+$/

const PRIVATE_SUFFIX = /\.(?:local|internal|localdomain|home|lan)$/

export interface PushSubscriptionInput {
  readonly endpoint: string
  readonly p256dh: string
  readonly auth: string
}

function keyBytes(value: string): number {
  return BASE64URL.test(value) ? Buffer.from(value, 'base64url').length : 0
}

function isUsableEndpoint(endpoint: string): boolean {
  if (endpoint.length === 0 || endpoint.length > ENDPOINT_MAX) return false

  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:') return false

    const host = url.hostname.toLowerCase()
    return (
      host.includes('.') &&
      !IP_LITERAL.test(host) &&
      !PRIVATE_SUFFIX.test(host) &&
      host !== 'localhost'
    )
  } catch {
    return false
  }
}

async function requirePushCentre(): Promise<{ service: NotificationService; userId: number }> {
  const actor = await getActor()
  if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))

  const service = notificationService()
  if (service === null) {
    throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-16'))
  }

  if (!(await pushAvailability()).enabled) {
    throw new ValidationError(msg('notice.app.board-offering-web-push'))
  }

  return { service, userId: actor.userId }
}

export async function subscribeToPushAction(input: PushSubscriptionInput): Promise<FormState> {
  try {
    if (
      !isUsableEndpoint(input.endpoint) ||
      keyBytes(input.p256dh) !== 65 ||
      keyBytes(input.auth) !== 16
    ) {
      return { error: await tr('notice.app.push-subscription-valid') }
    }

    const { service, userId } = await requirePushCentre()

    const existing = await service.pushSubscriptions(userId)
    const known = existing.some((subscription) => subscription.endpoint === input.endpoint)
    if (!known && existing.length >= SUBSCRIPTIONS_PER_USER_MAX) {
      return { error: await tr('notice.app.push-subscription-limit') }
    }

    await service.subscribeToPush({
      userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
    })
  } catch (err) {
    return toFormState(err)
  }

  return { notice: await tr('notice.pushSubscribed') }
}

export async function unsubscribeFromPushAction(endpoint: string): Promise<FormState> {
  try {
    const actor = await getActor()
    if (actor.userId === null) throw new ForbiddenError(msg('error.app.must-logged'))

    const service = notificationService()
    if (service === null) {
      throw new ForbiddenError(msg('error.app.board-running-in-memory-sample-data-16'))
    }

    if (!isUsableEndpoint(endpoint)) {
      return { error: await tr('notice.app.push-subscription-valid') }
    }

    await service.unsubscribeFromPush(actor.userId, endpoint)
  } catch (err) {
    return toFormState(err)
  }

  return { notice: await tr('notice.pushUnsubscribed') }
}
