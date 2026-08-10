import type { MailDriver } from '@meith/core'

import { renderNotificationMail, type MailBrand } from './mail'
import { renderNotification } from './render'
import type { NotificationRepository } from './types'

export type DeliveryOutcome =
  | 'sent'
  | 'missing'
  | 'declined'
  | 'already-sent'

export async function deliverNotificationEmail(deps: {
  readonly notifications: NotificationRepository
  readonly mail: MailDriver
  readonly brand: MailBrand
  readonly notificationId: number
  readonly now?: () => Date
}): Promise<DeliveryOutcome> {
  const deliverable = await deps.notifications.findForDelivery(deps.notificationId)
  if (deliverable === null) return 'missing'
  if (deliverable.emailSentAt !== null) return 'already-sent'
  if (!deliverable.emailEnabled) return 'declined'

  const mail = renderNotificationMail({
    view: renderNotification(deliverable.notification),
    brand: deps.brand,
    recipientName: deliverable.recipient.username,
  })

  const fromName = deps.brand.fromName ?? ''

  await deps.mail.send({
    to: deliverable.recipient.email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    ...(fromName === '' ? {} : { fromName }),
  })

  await deps.notifications.markEmailSent(
    deps.notificationId,
    (deps.now ?? (() => new Date()))(),
  )

  return 'sent'
}
