/** F55's pure notification view models. */
import type { TimeModel } from '@forum/theme-kit'
import type { NotificationPreferenceView, NotificationView } from '@forum/notifications'

import { formatTime } from './time'

export interface NotificationRowView {
  readonly id: number
  readonly subject: string
  readonly body: string
  readonly href: string | null
  readonly at: TimeModel
  readonly isRead: boolean
  /**
   * "…and 3 more times", or null.
   *
   * Rendered separately from the subject so a theme — or a later screen — can
   * place it without parsing a sentence, even though `renderNotification`
   * already folds the count into the subject for the mail path.
   */
  readonly repeated: string | null
}

export interface NotificationCentreView {
  readonly rows: readonly NotificationRowView[]
  readonly unread: number
  readonly nextHref: string | null
  readonly preferencesHref: string
}

export function buildNotificationCentreView(input: {
  readonly rows: readonly NotificationView[]
  readonly unread: number
  readonly nextCursor?: string | undefined
  readonly now: Date
  /**
   * The viewer's timezone (F57). Defaults to UTC — the zone every timestamp on
   * this board used before members could choose one.
   */
  readonly timeZone?: string
}): NotificationCentreView {
  return {
    rows: input.rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      body: row.body,
      href: row.href,
      /*
       * `updatedAt`, not `createdAt`. A coalesced notification's useful
       * timestamp is the last time the thing happened — a task that started
       * failing yesterday and failed again a minute ago is not a day-old
       * notification.
       */
      at: formatTime(row.updatedAt, input.now, input.timeZone),
      isRead: row.isRead,
      repeated:
        row.occurrences > 1 ? `Happened ${row.occurrences} times` : null,
    })),
    unread: input.unread,
    nextHref:
      input.nextCursor === undefined
        ? null
        : `/notifications?after=${encodeURIComponent(input.nextCursor)}`,
    preferencesHref: '/notifications/preferences',
  }
}

/** The preferences screen is the registry, so its view model is nearly a pass-through. */
export interface PreferencesView {
  readonly rows: readonly NotificationPreferenceView[]
  readonly backHref: string
}

export function buildPreferencesView(
  rows: readonly NotificationPreferenceView[],
): PreferencesView {
  return { rows, backHref: '/notifications' }
}

/** The notice after marking something read, assembled from the query string. */
export function notificationNotice(query: {
  readonly read?: string | undefined
  readonly saved?: string | undefined
}): string | null {
  if (query.saved !== undefined) return 'Your notification preferences were saved.'
  if (query.read === 'all') return 'All notifications marked as read.'
  if (query.read === 'one') return 'Marked as read.'
  return null
}
