'use client'

import { useActionState } from 'react'

import { PANEL_CARD } from '@/components/shell/panel-list'
import { EMPTY_STATE, type FormState } from '@/server/auth-form-state'
import { sendTestMailAction } from '@/server/mail-test-actions'

import { type Copy, fromCopy } from '../shell/copy'
import { Saved } from './form-bits'

export function MailTestCard({
  summary,
  sends,
  fromEnvironment,
  copy,
}: {
  summary: string
  sends: boolean
  fromEnvironment: boolean
  copy: Copy
}) {
  const [state, submit, pending] = useActionState<FormState, FormData>(
    sendTestMailAction,
    EMPTY_STATE,
  )

  return (
    <section className={PANEL_CARD}>
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-lg font-semibold">
          {fromCopy(copy, 'adminPanel.mail.title')}
        </h2>
        <p className="text-sm">
          {summary}
          {!sends && (
            <span className="text-muted-foreground">
              {' '}
              {fromCopy(copy, 'adminPanel.mail.reachesNobody')}
            </span>
          )}
        </p>
      </div>

      {fromEnvironment && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          {copy['adminPanel.mail.driverOverridesLead']}
          <code>MAIL_DRIVER</code>
          {copy['adminPanel.mail.driverOverridesTail']}{' '}
          {copy['adminPanel.mail.driverUntilUnsetLead']}
          <code>MAIL_DRIVER</code>
          {copy['adminPanel.mail.driverUntilUnsetTail']}
        </p>
      )}

      {state.error !== undefined && (
        <p
          role="alert"
          className="rounded-md border border-destructive bg-destructive/5 px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      )}

      <Saved when={state.notice !== undefined}>{state.notice}</Saved>

      <form action={submit} className="flex flex-col gap-2">
        <div>
          <button
            type="submit"
            disabled={pending || !sends}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {pending
              ? fromCopy(copy, 'adminPanel.mail.sending')
              : fromCopy(copy, 'adminPanel.mail.send')}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {copy['adminPanel.mail.testNoteLead']}
          <em>{fromCopy(copy, 'adminPanel.mail.testNoteSaved')}</em>
          {copy['adminPanel.mail.testNoteTail']}
        </p>
      </form>
    </section>
  )
}
