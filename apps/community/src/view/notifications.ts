import type { Translator } from '@meith/i18n'
import type { NotificationPreferenceView, NotificationView } from '@meith/notifications'
import type { TimeModel } from '@meith/theme-kit'

import { formatTime } from './time'

export interface NotificationRowView {
  readonly id: number
  readonly subject: string
  readonly body: string
  readonly href: string | null
  readonly at: TimeModel
  readonly isRead: boolean
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
  readonly t?: Translator
}): NotificationCentreView {
  return {
    rows: input.rows.map((row) => ({
      id: row.id,
      subject: row.subject,
      body: row.body,
      href: row.href,
      at: formatTime(row.updatedAt, input.now, input.t),
      isRead: row.isRead,
      repeated: row.occurrences > 1 ? `Happened ${row.occurrences} times` : null,
    })),
    unread: input.unread,
    nextHref:
      input.nextCursor === undefined
        ? null
        : `/notifications?after=${encodeURIComponent(input.nextCursor)}`,
    preferencesHref: '/notifications/preferences',
  }
}

export interface PreferencesView {
  readonly rows: readonly NotificationPreferenceView[]
  readonly backHref: string
}

export function buildPreferencesView(rows: readonly NotificationPreferenceView[]): PreferencesView {
  return { rows, backHref: '/notifications' }
}

export function notificationNotice(query: {
  readonly read?: string | undefined
  readonly saved?: string | undefined
}): string | null {
  if (query.saved !== undefined) return 'Your notification preferences were saved.'
  if (query.read === 'all') return 'All notifications marked as read.'
  if (query.read === 'one') return 'Marked as read.'
  return null
}
