'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  saveNotificationPreferencesAction,
} from '@/server/notification-actions'

import { FormError } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'

const BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const LINK_BUTTON =
  'text-sm font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function MarkNotificationReadForm({
  notificationId,
  copy,
}: {
  notificationId: number
  copy: Copy
}) {
  const [state, action] = useActionState(markNotificationReadAction, EMPTY_STATE)

  return (
    <form action={action} className="contents">
      <input type="hidden" name="notificationId" value={notificationId} />
      <FormError message={state.error} />
      <button type="submit" className={LINK_BUTTON}>
        {fromCopy(copy, 'accountForm.notifications.markRead')}
      </button>
    </form>
  )
}

export function MarkAllNotificationsReadForm({ unread, copy }: { unread: number; copy: Copy }) {
  const [state, action] = useActionState(markAllNotificationsReadAction, EMPTY_STATE)

  if (unread === 0) return null

  return (
    <form action={action}>
      <FormError message={state.error} />
      <button type="submit" className={BUTTON}>
        {fromCopy(copy, 'accountForm.notifications.markAllRead')}
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

export function NotificationPreferencesForm({
  rows,
  copy,
}: {
  rows: readonly PreferenceRow[]
  copy: Copy
}) {
  const [state, action] = useActionState(saveNotificationPreferencesAction, EMPTY_STATE)

  return (
    <form
      action={action}
      className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5"
    >
      <FormError message={state.error} />

      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-medium">
          {fromCopy(copy, 'accountForm.notifications.legend')}
        </legend>

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
        {fromCopy(copy, 'accountForm.notifications.blurb')}
      </p>

      <div>
        <button type="submit" className={BUTTON}>
          {fromCopy(copy, 'accountForm.notifications.submit')}
        </button>
      </div>
    </form>
  )
}
