'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import {
  deleteBackupAction,
  requestBackupAction,
  testBackupDestinationAction,
} from '@/server/backup-admin-actions'

import { FormError, PendingButton, SubmitButton } from '../auth/form-controls'
import { ConfirmDialog } from '../shell/confirm-dialog'
import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'
import { Saved } from './form-bits'

const ROW_BUTTON =
  'inline-flex h-8 items-center justify-center rounded-md border border-destructive/30 bg-destructive/10 px-2.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function RequestBackupForm({ disabled, copy }: { disabled: boolean; copy: Copy }) {
  const [state, action] = useActionState(requestBackupAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      {state.notice === 'queued' && <Saved>{fromCopy(copy, 'adminPanel.backup.queued')}</Saved>}
      {state.notice === 'already' && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
          {fromCopy(copy, 'adminPanel.backup.already')}
        </p>
      )}
      <div>
        {disabled ? (
          <button
            type="button"
            disabled
            className="inline-flex h-10 cursor-not-allowed items-center rounded-md border border-border px-4 text-sm opacity-60"
          >
            {fromCopy(copy, 'adminPanel.backup.now')}
          </button>
        ) : (
          <SubmitButton className="w-auto">{fromCopy(copy, 'adminPanel.backup.now')}</SubmitButton>
        )}
      </div>
    </form>
  )
}

export function DeleteBackupForm({ name, copy }: { name: string; copy: Copy }) {
  const [state, action] = useActionState(deleteBackupAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="name" value={name} />
      <PendingButton className={ROW_BUTTON}>
        {fromCopy(copy, 'adminPanel.backup.delete')}
      </PendingButton>
      {state.notice === 'deleted' && (
        <span className="text-xs text-muted-foreground">
          {formatFromCopy(copy, 'adminPanel.backup.deleted', { name: state.values?.name ?? name })}
        </span>
      )}
      {state.error !== undefined && <span className="text-xs text-destructive">{state.error}</span>}
      <ConfirmDialog confirm={state.confirm} action={action} />
    </form>
  )
}

export function TestDestinationForm({ copy }: { copy: Copy }) {
  const [state, action] = useActionState(testBackupDestinationAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-2">
      <FormError message={state.error} />
      {state.notice === 'reachable' && (
        <Saved>
          {formatFromCopy(copy, 'adminPanel.backup.reachable', {
            count: Number(state.values?.count ?? 0),
          })}
        </Saved>
      )}
      <div>
        <SubmitButton className="w-auto">{fromCopy(copy, 'adminPanel.backup.test')}</SubmitButton>
      </div>
    </form>
  )
}
