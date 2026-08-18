import { EN_CATALOG, sourceTranslator } from '@meith/i18n'

import type { DeliveryOutcome, NotificationTranslatorResolver } from './deliver'
import { PUSH_PAYLOAD_LIMIT, sendWebPush, type VapidDetails } from './push'
import { renderNotification } from './render'
import type { NotificationRepository } from './types'

const BODY_LIMIT = 300

export interface PushDeliveryResult {
  readonly outcome: DeliveryOutcome
  readonly sent: number
  readonly pruned: number
  readonly failed: number
}

export function pushPayload(input: {
  readonly notificationId: number
  readonly title: string
  readonly body: string
  readonly href: string | null
  readonly badge: number
}): string {
  const payload = JSON.stringify({
    id: input.notificationId,
    title: input.title,
    body: input.body.replace(/\s+/g, ' ').trim().slice(0, BODY_LIMIT),
    href: input.href,
    badge: input.badge,
  })

  return Buffer.byteLength(payload, 'utf8') > PUSH_PAYLOAD_LIMIT
    ? JSON.stringify({
        id: input.notificationId,
        title: input.title.slice(0, BODY_LIMIT),
        body: '',
        href: input.href,
        badge: input.badge,
      })
    : payload
}

export async function deliverNotificationPush(deps: {
  readonly notifications: NotificationRepository
  readonly vapid: VapidDetails
  readonly notificationId: number
  readonly translatorForLocale?: NotificationTranslatorResolver
  readonly now?: () => Date
  readonly send?: typeof sendWebPush
}): Promise<PushDeliveryResult> {
  const nothing = { sent: 0, pruned: 0, failed: 0 }

  const deliverable = await deps.notifications.findForDelivery(deps.notificationId)
  if (deliverable === null) return { outcome: 'missing', ...nothing }
  if (deliverable.pushSentAt !== null) return { outcome: 'already-sent', ...nothing }
  if (!deliverable.pushEnabled) return { outcome: 'declined', ...nothing }

  const subscriptions = await deps.notifications.pushSubscriptionsFor(deliverable.recipient.userId)
  if (subscriptions.length === 0) return { outcome: 'unsubscribed', ...nothing }

  const t = await (deps.translatorForLocale ?? (() => sourceTranslator(EN_CATALOG)))(
    deliverable.recipient.locale,
  )
  const view = renderNotification(deliverable.notification, t)
  const now = deps.now ?? (() => new Date())
  const send = deps.send ?? sendWebPush

  const payload = pushPayload({
    notificationId: view.id,
    title: view.subject,
    body: view.body,
    href: view.href,
    badge: await deps.notifications.unreadCount(deliverable.recipient.userId),
  })

  let sent = 0
  let pruned = 0
  let failed = 0

  for (const subscription of subscriptions) {
    const result = await send({
      subscription: {
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
      payload,
      vapid: deps.vapid,
      now: now(),
    })

    if (result.outcome === 'sent') {
      sent += 1
      await deps.notifications.touchPushSubscription(subscription.id, now())
      continue
    }

    if (result.outcome === 'gone') {
      pruned += 1
      await deps.notifications.prunePushSubscription(subscription.id)
      continue
    }

    failed += 1
  }

  if (sent === 0 && failed > 0) {
    throw new Error(
      `Every push service refused notification ${deps.notificationId} (${failed} endpoint(s)).`,
    )
  }

  await deps.notifications.markPushSent(deps.notificationId, now())

  return { outcome: sent > 0 ? 'sent' : 'unsubscribed', sent, pruned, failed }
}
