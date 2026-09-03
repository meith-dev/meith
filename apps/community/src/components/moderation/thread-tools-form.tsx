'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { threadToolAction } from '@/server/thread-tool-actions'

import { FormError, PendingButton } from '../auth/form-controls'
import { ConfirmDialog } from '../shell/confirm-dialog'
import { type Copy, fromCopy } from '../shell/copy'

const BUTTON =
  'inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const SELECT =
  'h-8 min-w-0 max-w-full rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const SUMMARY =
  'flex cursor-pointer list-none items-center gap-2 rounded-lg px-4 py-3 text-xs font-medium text-muted-foreground select-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden'

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className="size-3 shrink-0 transition-transform group-open/tools:rotate-90"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m4.5 3 3 3-3 3" />
    </svg>
  )
}

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
  open = false,
  children,
}: {
  threadId: number
  isLocked: boolean
  isSticky: boolean
  rights: { lock: boolean; stick: boolean; move: boolean; delete: boolean }
  moveTargets: readonly MoveOption[]
  heading: string
  copy: Copy
  open?: boolean
  children?: React.ReactNode
}) {
  const [state, action] = useActionState(threadToolAction, EMPTY_STATE)

  return (
    <section aria-label={heading} className="rounded-lg border border-border bg-secondary">
      <details className="group/tools" open={open || state.error !== undefined ? true : undefined}>
        <summary className={SUMMARY}>
          <Chevron />
          {heading}
        </summary>

        <div className="flex flex-col gap-2 px-4 pb-3">
          <form action={action} className="flex flex-wrap items-center gap-2">
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
              <span className="flex min-w-0 max-w-full basis-full flex-wrap items-center gap-2 sm:basis-auto">
                <label className="flex min-w-0 max-w-full flex-1 items-center text-xs sm:flex-none">
                  <span className="sr-only">{fromCopy(copy, 'moderationForm.moveTo')}</span>
                  <select name="toForumId" className={`${SELECT} w-full sm:w-auto sm:max-w-56`}>
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

          <FormError message={state.error} />
        </div>
      </details>

      <ConfirmDialog confirm={state.confirm} action={action} />
    </section>
  )
}
