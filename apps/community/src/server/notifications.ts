import 'server-only'

import { cache } from 'react'

import type { ReportNotifierPort, WarningNotifierPort } from '@meith/moderation'
import { NotificationService } from '@meith/notifications'
import {
  type PluginDefinition,
  type PluginNotificationKindSpec,
  pluginNotificationKindSpecs,
} from '@meith/plugin-kit'

import forumConfig from '../../community.config'
import { getContainer } from './container'

const PLUGIN_KINDS: readonly PluginNotificationKindSpec[] = (forumConfig.plugins ?? []).flatMap(
  (entry) => {
    if (entry.enabled === false) return []
    const definition = entry.plugin as PluginDefinition | undefined
    if (definition === undefined) return []
    return pluginNotificationKindSpecs(definition.key, definition.notifications ?? [])
  },
)

export function notificationService(): NotificationService | null {
  const { notifications } = getContainer()
  return notifications === null
    ? null
    : new NotificationService({ notifications, extraKinds: PLUGIN_KINDS })
}

export function warningNotifier(): WarningNotifierPort | null {
  const service = notificationService()
  if (service === null) return null

  return {
    async warned(input) {
      await service.raise({
        userId: input.userId,
        kind: 'warning.received',
        data: {
          title: input.title,
          points: input.points,
          totalPoints: input.totalPoints,
          reason: input.reason,
          restriction: input.restriction,
        },
        href: null,
      })
    },
  }
}

export function reportNotifier(): ReportNotifierPort | null {
  const service = notificationService()
  if (service === null) return null

  return {
    async reportClosed(input) {
      await service.raise({
        userId: input.reporterUserId,
        kind: 'report.actioned',
        data: { outcome: input.outcome, targetLabel: input.targetLabel },
        dedupeKey: `report.actioned:${input.reportId}`,
        href: null,
      })
    },
  }
}

export const unreadNotificationCount = cache(async function unreadNotificationCount(
  userId: number | null,
): Promise<number> {
  if (userId === null) return 0
  const service = notificationService()
  if (service === null) return 0

  try {
    return await service.unreadCount(userId)
  } catch {
    return 0
  }
})
