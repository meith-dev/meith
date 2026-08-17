'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  saveNotificationPreferencesAction,
} from '@/server/notification-actions'

import { FormError } from '../auth/form-controls'

const BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const LINK_BUTTON =
  'text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function MarkNotificationReadForm({ notificationId }: { notificationId: number }) {
  const [state, action] = useActionState(markNotificationReadAction, EMPTY_STATE)

  return (
    <form action={action} className="contents">
      <input type="hidden" name="notificationId" value={notificationId} />
      <FormError message={state.error} />
      <button type="submit" className={LINK_BUTTON}>
        Mark as read
      </button>
    </form>
  )
}

export function MarkAllNotificationsReadForm({ unread }: { unread: number }) {
  const [state, action] = useActionState(markAllNotificationsReadAction, EMPTY_STATE)

  if (unread === 0) return null

  return (
    <form action={action}>
      <FormError message={state.error} />
      <button type="submit" className={BUTTON}>
        Mark all as read
      </button>
    </form>
  )
}

export interface PreferenceRow {
  readonly kind: string
  readonly title: string
  readonly description: string
  readonly email: boolean
}

export function NotificationPreferencesForm({ rows }: { rows: readonly PreferenceRow[] }) {
  const [state, action] = useActionState(saveNotificationPreferencesAction, EMPTY_STATE)

  return (
    <form
      action={action}
      className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5"
    >
      <FormError message={state.error} />

      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-medium">Send me an e-mail when…</legend>

        {rows.map((row) => (
          <label key={row.kind} className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="email"
              value={row.kind}
              defaultChecked={row.email}
              className="mt-1 size-4 rounded border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <span>
              <span className="font-medium">{row.title}</span>
              <span className="block text-muted-foreground">{row.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <p className="text-xs text-muted-foreground">
        Everything is always recorded in your notifications, whether or not you receive an e-mail
        about it.
      </p>

      <div>
        <button type="submit" className={BUTTON}>
          Save preferences
        </button>
      </div>
    </form>
  )
}
