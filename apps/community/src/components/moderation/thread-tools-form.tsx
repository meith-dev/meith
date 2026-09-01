'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { threadToolAction } from '@/server/thread-tool-actions'

import { FormError, PendingButton } from '../auth/form-controls'
import { ConfirmDialog } from '../shell/confirm-dialog'
import { type Copy, fromCopy } from '../shell/copy'

const BUTTON =
  'inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export interface MoveOption {
  readonly id: number
  readonly title: string
}

export function ThreadToolsForm({
  threadId,
  isLocked,
  isSticky,
  rights,
  moveTargets,
  heading,
  copy,
  children,
}: {
  threadId: number
  isLocked: boolean
  isSticky: boolean
  rights: { lock: boolean; stick: boolean; move: boolean; delete: boolean }
  moveTargets: readonly MoveOption[]
  heading: string
  copy: Copy
  children?: React.ReactNode
}) {
  const [state, action] = useActionState(threadToolAction, EMPTY_STATE)

  return (
    <section
      aria-label={heading}
      className="flex flex-col gap-2 rounded-lg border border-border bg-secondary px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground">{heading}</span>

        <form action={action} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="threadId" value={threadId} />

          {rights.lock && (
            <PendingButton name="tool" value={isLocked ? 'unlock' : 'lock'} className={BUTTON}>
              {isLocked
                ? fromCopy(copy, 'moderationForm.tool.unlock')
                : fromCopy(copy, 'moderationForm.tool.lock')}
            </PendingButton>
          )}
          {rights.stick && (
            <PendingButton name="tool" value={isSticky ? 'unstick' : 'stick'} className={BUTTON}>
              {isSticky
                ? fromCopy(copy, 'moderationForm.tool.unpin')
                : fromCopy(copy, 'moderationForm.tool.pin')}
            </PendingButton>
          )}
          {rights.delete && (
            <PendingButton
              name="tool"
              value="delete"
              className={`${BUTTON} border-destructive/40 text-destructive`}
            >
              {fromCopy(copy, 'moderationForm.tool.deleteThread')}
            </PendingButton>
          )}

          {rights.move && moveTargets.length > 0 && (
            <span className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs">
                <span className="sr-only">{fromCopy(copy, 'moderationForm.moveTo')}</span>
                <select
                  name="toForumId"
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {moveTargets.map((forum) => (
                    <option key={forum.id} value={forum.id}>
                      {forum.title}
                    </option>
                  ))}
                </select>
              </label>
              <PendingButton name="tool" value="move" className={BUTTON}>
                {fromCopy(copy, 'moderationForm.tool.move')}
              </PendingButton>
              <PendingButton name="tool" value="copy" className={BUTTON}>
                {fromCopy(copy, 'moderationForm.tool.copy')}
              </PendingButton>
            </span>
          )}
        </form>

        {children}
      </div>

      <FormError message={state.error} />
      <ConfirmDialog confirm={state.confirm} action={action} />
    </section>
  )
}
