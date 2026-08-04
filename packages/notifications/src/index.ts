/**
 * `@meith/notifications` — F55.
 *
 * The board's one answer to "somebody needs to be told something". Everything
 * that notifies goes through `NotificationService`: it writes the on-site
 * record, decides from the member's preferences whether an e-mail is wanted,
 * and — when it is — emits the outbox row that becomes a queued mail job.
 *
 * A domain package in the R2 sense: interfaces in, no SQL, no Next, no driver
 * implementations. The `MailDriver` it touches is the *port* from `@meith/core`.
 */
export {
  NOTIFICATION_KINDS,
  configurableKindsFor,
  isNotificationKind,
  notificationKind,
  type NotificationAudience,
  type NotificationKind,
  type NotificationKindSpec,
} from './kinds'

export {
  NotificationService,
  MAX_STAFF_FANOUT,
  NOTIFICATIONS_PAGE_SIZE,
  type NotificationPreferenceView,
} from './service'

export { renderNotification, type NotificationView } from './render'

export {
  renderNotificationMail,
  type MailBrand,
  type RenderedMail,
} from './mail'

export { deliverNotificationEmail, type DeliveryOutcome } from './deliver'

export type {
  DeliverableNotification,
  NotificationData,
  NotificationPage,
  NotificationRecord,
  NotificationRepository,
  RaiseInput,
  RaiseResult,
} from './types'
