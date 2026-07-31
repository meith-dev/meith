import 'server-only'

/**
 * F55 — the app's one way to reach the notification service.
 *
 * Two things live here. The service itself, resolved from the container and
 * `null` in fixture mode; and the **adapters** that let F53's warnings and
 * F49's reports notify somebody without either of them importing
 * `@forum/notifications`.
 *
 * The adapters are the interesting part. Both domain packages declare a
 * one-verb port (`WarningNotifierPort`, `ReportNotifierPort`) and this is where
 * those verbs become a `raise`. Handing them the service directly would have
 * been fewer lines and would have let a later change reach `markAllRead` from
 * inside a moderation command — the same argument D52 makes for giving the
 * warning service one `ban` verb instead of the whole `BanService`.
 */
import { NotificationService } from '@forum/notifications'
import type { ReportNotifierPort, WarningNotifierPort } from '@forum/moderation'

import { getContainer } from './container'

/**
 * The service, or `null` on a board with no notification store.
 *
 * Fixture mode is the only such board today. Callers branch on the null rather
 * than receiving a no-op service, because "this board cannot notify" is a fact
 * the screens have to show — a notification centre that silently records
 * nothing looks exactly like one with nothing in it.
 */
export function notificationService(): NotificationService | null {
  const { notifications } = getContainer()
  return notifications === null ? null : new NotificationService({ notifications })
}

/**
 * F53's port.
 *
 * The link points at the member's own warning record rather than at the
 * moderator screen that issued it: `/moderation/warn?user=` is staff-only, and
 * a notification whose link 404s for its recipient is worse than one with no
 * link. Until F57's UserCP has a "your warnings" page there is nothing member-
 * facing to point at, so it points nowhere and says everything in the text —
 * which is why `render.ts` puts the reason in the body.
 */
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
        /*
         * No dedupe key. Two warnings in a day are two things that happened,
         * and collapsing them would hide the second — which is precisely the
         * one that took somebody over a threshold.
         */
        href: null,
      })
    },
  }
}

/** F49's port. Points at nothing: a closed report has no page a member may open. */
export function reportNotifier(): ReportNotifierPort | null {
  const service = notificationService()
  if (service === null) return null

  return {
    async reportClosed(input) {
      await service.raise({
        userId: input.reporterUserId,
        kind: 'report.actioned',
        data: { outcome: input.outcome, targetLabel: input.targetLabel },
        /*
         * Keyed by report, so the same report closed and re-opened and closed
         * again is one unread line. Two *different* reports are two rows.
         */
        dedupeKey: `report.actioned:${input.reportId}`,
        href: null,
      })
    },
  }
}

/**
 * The unread badge in the user panel (F27's `UserPanelModel`).
 *
 * A count on every page render for every signed-in member, which is a real
 * cost and the reason the migration gives it a partial index over unread rows
 * only. Guests and fixture mode never query.
 *
 * Never throws: the shell renders the error pages too, and a notification count
 * is not worth failing a page over.
 */
export async function unreadNotificationCount(userId: number | null): Promise<number> {
  if (userId === null) return 0
  const service = notificationService()
  if (service === null) return 0

  try {
    return await service.unreadCount(userId)
  } catch {
    return 0
  }
}
