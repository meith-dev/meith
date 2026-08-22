'use client'

import { useActionState } from 'react'

import { undoAdminAction } from '@/server/admin-undo-actions'
import { EMPTY_STATE, type UndoState } from '@/server/auth-form-state'

import { FormError, SubmitButton } from '../auth/form-controls'
import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'
import { Saved } from './form-bits'

export function AdminUndo({ undo, copy }: { undo: UndoState | undefined; copy: Copy }) {
  const [state, action] = useActionState(undoAdminAction, EMPTY_STATE)

  if (undo === undefined && state.notice !== 'undone' && state.error === undefined) return null

  return (
    <div aria-live="polite" className="flex flex-col gap-2">
      <FormError message={state.error} />
      <Saved when={state.notice === 'undone'}>{fromCopy(copy, 'admin.undoSucceeded')}</Saved>
      {undo !== undefined && state.notice !== 'undone' && (
        <form action={action} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="undoToken" value={undo.token} />
          <span className="text-sm text-muted-foreground">
            {formatFromCopy(copy, 'admin.undoUntil', { time: undo.expiresAt })}
          </span>
          <SubmitButton>{fromCopy(copy, 'admin.undo')}</SubmitButton>
        </form>
      )}
    </div>
  )
}
