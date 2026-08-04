/**
 * F55 — sending the e-mail for one notification.
 *
 * This runs inside a queued job (F07's relay puts it there; see
 * `@meith/runtime`'s `notifications.email` handler), never on a request path.
 * It takes the `MailDriver` *port* from `@meith/core`, so the domain still has
 * no idea whether the board sends through SMTP, an HTTP provider, or a log
 * line — that choice belongs to the composition root.
 *
 * ## Delivery is at-least-once, and this narrows it once
 *
 * The queue can hand the same job over twice: a worker that sent the message
 * and died before acknowledging it will be given the job again. `emailSentAt`
 * is checked before sending and written after, which removes every duplicate
 * except the one inside that crash window. Closing that window entirely would
 * mean claiming *before* sending, which converts a rare duplicate into a lost
 * message — the wrong trade for a warning somebody is meant to read.
 *
 * ## Three reasons to send nothing, all normal
 *
 * The notification was deleted with its account; the recipient turned this kind
 * off after it was raised; a message already went. None is an error and none
 * throws, because a throw here is a queue retry, and retrying a decision that
 * will be identical every time is how a job reaches its dead-letter for no
 * reason.
 */
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
  /** Resolved per delivery: the board's name and colours can change. */
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

  /*
   * A throw from the driver propagates on purpose: that is the one failure
   * worth retrying, and F05's drivers deliberately contain no retry logic of
   * their own because the queue's backoff is the retry mechanism.
   */
  await deps.mail.send({
    to: deliverable.recipient.email,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  })

  await deps.notifications.markEmailSent(
    deps.notificationId,
    (deps.now ?? (() => new Date()))(),
  )

  return 'sent'
}
