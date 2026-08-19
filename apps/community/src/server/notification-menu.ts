import 'server-only'

import type { Actor } from '@meith/authorization'
import type { MessageListRow } from '@meith/messages'
import type { NotificationView } from '@meith/notifications'

import { buildNotificationMenuView, type NotificationMenuModel } from '../view/notification-menu'
import { getContainer } from './container'
import { getTranslator } from './i18n'
import { messageService, unreadMessageCount } from './messages'
import { notificationService, unreadNotificationCount } from './notifications'

export async function buildNotificationMenuModel(
  actor: Actor,
): Promise<NotificationMenuModel | null> {
  if (actor.userId === null) return null

  const { authorizer } = getContainer()
  const translator = await getTranslator()
  const now = new Date()

  const notifications = notificationService()
  const notificationRows: readonly NotificationView[] =
    notifications === null
      ? []
      : await notifications
          .list(actor.userId, {}, translator)
          .then((page) => page.rows)
          .catch(() => [])

  const canPm = authorizer.can(actor, 'pm.use')
  const messages = messageService()
  const messageRows: readonly MessageListRow[] =
    !canPm || messages === null
      ? []
      : await messages
          .list({ userId: actor.userId, folder: 'inbox', offset: 0 })
          .then((page) => page.rows)
          .catch(() => [])

  const [notificationsUnread, messagesUnread] = await Promise.all([
    unreadNotificationCount(actor.userId),
    canPm ? unreadMessageCount(actor.userId) : Promise.resolve(0),
  ])

  return buildNotificationMenuView({
    notifications: notificationRows,
    notificationsUnread,
    messages: messageRows,
    messagesUnread,
    canModerate: actor.global.canAccessModCp === true || actor.global.canAccessAdminCp === true,
    now,
    t: translator,
  })
}
