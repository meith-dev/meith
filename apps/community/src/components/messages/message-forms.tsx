'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { messageBulkAction, sendMessageAction } from '@/server/message-actions'

import { FormError, PendingButton } from '../auth/form-controls'
import { MarkdownEditor } from '../content/markdown-editor'
import { type Copy, fromCopy } from '../shell/copy'

const FIELD =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const SECONDARY =
  'inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const CARD = 'flex flex-col gap-4 rounded-lg border border-border bg-card p-5'

export function ComposeForm({
  to,
  subject,
  message,
  replyToId,
  copy,
}: {
  to: string
  subject: string
  message: string
  replyToId: number | null
  copy: Copy
}) {
  const [state, action] = useActionState(sendMessageAction, EMPTY_STATE)

  const values = state.values ?? {}

  return (
    <form action={action} className={CARD}>
      <FormError message={state.error} />
      {replyToId === null ? null : <input type="hidden" name="replyTo" value={replyToId} />}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'messageForm.to')}</span>
        <input
          name="to"
          defaultValue={values.to ?? to}
          className={FIELD}
          autoComplete="off"
          required
        />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'messageForm.toHint')}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'messageForm.bcc')}</span>
        <input name="bcc" defaultValue={values.bcc ?? ''} className={FIELD} autoComplete="off" />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'messageForm.bccHint')}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'messageForm.subject')}</span>
        <input
          name="subject"
          defaultValue={values.subject ?? subject}
          className={FIELD}
          maxLength={200}
          required
        />
      </label>

      <MarkdownEditor
        id="message-body"
        required
        rows={12}
        defaultValue={values.message ?? message}
        hint={fromCopy(copy, 'messageForm.bodyHint')}
      />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="receipt" className="size-4 rounded border-border" />
        <span>{fromCopy(copy, 'messageForm.receipt')}</span>
      </label>

      <div>
        <PendingButton className={BUTTON} showWorking>
          {fromCopy(copy, 'messageForm.send')}
        </PendingButton>
      </div>
    </form>
  )
}

export function MessageActionBar({
  formId,
  folder,
  copy,
}: {
  formId: string
  folder: 'inbox' | 'sent' | 'trash'
  copy: Copy
}) {
  const [state, action] = useActionState(messageBulkAction, EMPTY_STATE)

  return (
    <form id={formId} action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      <input type="hidden" name="folder" value={folder} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'messageForm.withSelected')}
        </span>

        {folder === 'inbox' && (
          <>
            <PendingButton name="command" value="read" className={SECONDARY}>
              {fromCopy(copy, 'messageForm.markRead')}
            </PendingButton>
            <PendingButton name="command" value="unread" className={SECONDARY}>
              {fromCopy(copy, 'messageForm.markUnread')}
            </PendingButton>
          </>
        )}

        {folder === 'trash' ? (
          <>
            <PendingButton name="command" value="restore" className={SECONDARY}>
              {fromCopy(copy, 'messageForm.restore')}
            </PendingButton>
            <PendingButton name="command" value="delete" className={SECONDARY}>
              {fromCopy(copy, 'messageForm.deleteForever')}
            </PendingButton>
            <PendingButton name="command" value="empty" className={SECONDARY}>
              {fromCopy(copy, 'messageForm.emptyTrash')}
            </PendingButton>
          </>
        ) : (
          <PendingButton name="command" value="trash" className={SECONDARY}>
            {fromCopy(copy, 'messageForm.moveToTrash')}
          </PendingButton>
        )}
      </div>
    </form>
  )
}
