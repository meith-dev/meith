export {
  NOTIFICATION_KINDS,
  configurableKindsFor,
  isNotificationKind,
  notificationKind,
  type NotificationAudience,
  type NotificationKind,
  type NotificationKindSpec,
  type RegisteredNotificationKind,
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
