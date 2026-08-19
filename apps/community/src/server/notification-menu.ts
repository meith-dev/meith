import 'server-only'

import type { Actor } from '@meith/authorization'
import type { MessageListRow } from '@meith/messages'
import { ModerationQueue, type QueueItem, type ReportRow, ReportService } from '@meith/moderation'
import type { NotificationView } from '@meith/notifications'

import {
  buildNotificationMenuView,
  type ModerationSummary,
  type NotificationMenuModel,
} from '../view/notification-menu'
import { getContainer } from './container'
import { getTranslator } from './i18n'
import { messageService, unreadMessageCount } from './messages'
import { modCpCounts, resolveModCpAccess } from './modcp'
import { notificationService, unreadNotificationCount } from './notifications'
import { hasReportScope, resolveReportScope } from './report-scope'

async function moderationSummary(): Promise<ModerationSummary | null> {
  const access = await resolveModCpAccess()
  if (access === null) return null

  const { moderationQueue, reports } = getContainer()

  const counts = await modCpCounts()

  const queue: readonly QueueItem[] =
    moderationQueue === null
      ? []
      : await new ModerationQueue({ queue: moderationQueue })
          .list(access.forumIds, { offset: 0 })
          .then((page) => page.items)
          .catch(() => [])

  const scope = await resolveReportScope()
  const reportRows: readonly ReportRow[] =
    reports === null || !hasReportScope(scope)
      ? []
      : await new ReportService({ reports })
          .listOpen(scope, { offset: 0 })
          .then((page) => page.rows)
          .catch(() => [])

  return {
    queue,
    reports: reportRows,
    pending: counts.pending,
    openReports: counts.openReports,
  }
}

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

  const [notificationsUnread, messagesUnread, moderation] = await Promise.all([
    unreadNotificationCount(actor.userId),
    canPm ? unreadMessageCount(actor.userId) : Promise.resolve(0),
    moderationSummary(),
  ])

  return buildNotificationMenuView({
    notifications: notificationRows,
    notificationsUnread,
    messages: messageRows,
    messagesUnread,
    moderation,
    now,
    t: translator,
  })
}
