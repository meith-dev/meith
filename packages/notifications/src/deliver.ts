import type { MailDriver } from '@meith/core'
import { EN_CATALOG, sourceTranslator, type Translator } from '@meith/i18n'

import { type MailBrand, renderNotificationMail } from './mail'
import { renderNotification } from './render'
import type { NotificationRepository } from './types'

export type DeliveryOutcome = 'sent' | 'missing' | 'declined' | 'already-sent'

export type NotificationTranslatorResolver = (locale: string) => Promise<Translator> | Translator

export async function deliverNotificationEmail(deps: {
  readonly notifications: NotificationRepository
  readonly mail: MailDriver
  readonly brand: MailBrand
  readonly notificationId: number
  readonly translatorForLocale?: NotificationTranslatorResolver
  readonly now?: () => Date
}): Promise<DeliveryOutcome> {
  const deliverable = await deps.notifications.findForDelivery(deps.notificationId)
  if (deliverable === null) return 'missing'
  if (deliverable.emailSentAt !== null) return 'already-sent'
  if (!deliverable.emailEnabled) return 'declined'

  const t = await (deps.translatorForLocale ?? (() => sourceTranslator(EN_CATALOG)))(
    deliverable.recipient.locale,
  )
  const mail = renderNotificationMail({
    view: renderNotification(deliverable.notification, t),
    brand: deps.brand,
    recipientName: deliverable.recipient.username,
    t,
  })

  const fromName = deps.brand.fromName ?? ''

  await deps.mail.send({
    to: deliverable.recipient.email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    ...(fromName === '' ? {} : { fromName }),
  })

  await deps.notifications.markEmailSent(deps.notificationId, (deps.now ?? (() => new Date()))())

  return 'sent'
}
