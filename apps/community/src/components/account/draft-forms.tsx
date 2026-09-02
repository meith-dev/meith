'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { deleteDraftAction } from '@/server/content-actions'

import { FormError, PendingButton } from '../auth/form-controls'
import { ConfirmDialog } from '../shell/confirm-dialog'
import { type Copy, fromCopy } from '../shell/copy'

export function DeleteDraftForm({
  forumId,
  threadId,
  copy,
}: {
  forumId: number
  threadId: number | null
  copy: Copy
}) {
  const [state, action] = useActionState(deleteDraftAction, EMPTY_STATE)

  return (
    <div className="shrink-0">
      <form action={action}>
        <FormError message={state.error} />
        <input type="hidden" name="forumId" value={forumId} />
        {threadId !== null && <input type="hidden" name="threadId" value={threadId} />}
        <PendingButton
          showWorking
          className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {fromCopy(copy, 'draftsPage.delete')}
        </PendingButton>
      </form>
      <ConfirmDialog confirm={state.confirm} action={action} />
    </div>
  )
}
