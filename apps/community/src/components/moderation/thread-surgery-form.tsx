'use client'

import { useActionState } from 'react'

import { buttonVariants, controlVariants } from '@meith/ui'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { mergeThreadAction, splitThreadAction } from '@/server/surgery-actions'

import { FormError, PendingButton } from '../auth/form-controls'
import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'

const BUTTON = buttonVariants({ variant: 'outline', size: 'sm' })
const FIELD = controlVariants({ size: 'sm', className: 'w-auto max-w-full' })
const LABEL = 'flex min-w-0 max-w-full items-center text-xs'

export interface SplitPoint {
  readonly id: number
  readonly number: number
  readonly author: string
}

export function ThreadSurgeryForm({
  threadId,
  rights,
  splitPoints,
  copy,
}: {
  threadId: number
  rights: { merge: boolean; split: boolean }
  splitPoints: readonly SplitPoint[]
  copy: Copy
}) {
  const [splitState, splitAction] = useActionState(splitThreadAction, EMPTY_STATE)
  const [mergeState, mergeAction] = useActionState(mergeThreadAction, EMPTY_STATE)

  return (
    <>
      {rights.split && splitPoints.length > 0 && (
        <form action={splitAction} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="threadId" value={threadId} />
            <label className={LABEL}>
              <span className="sr-only">{fromCopy(copy, 'moderationForm.surgery.fromSr')}</span>
              <select name="fromPostId" className={`${FIELD} sm:max-w-64`}>
                {splitPoints.map((point) => (
                  <option key={point.id} value={point.id}>
                    {formatFromCopy(copy, 'moderationForm.surgery.splitPoint', {
                      number: point.number,
                      author: point.author,
                    })}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              <span className="sr-only">{fromCopy(copy, 'moderationForm.surgery.titleSr')}</span>
              <input
                type="text"
                name="title"
                required
                minLength={3}
                maxLength={150}
                placeholder={fromCopy(copy, 'moderationForm.newThreadTitle')}
                className={`${FIELD} w-48`}
              />
            </label>
            <PendingButton showWorking className={BUTTON}>
              {fromCopy(copy, 'moderationForm.surgery.split')}
            </PendingButton>
          </div>
          <FormError message={splitState.error} />
        </form>
      )}

      {rights.merge && (
        <form action={mergeAction} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="threadId" value={threadId} />
            <label className={LABEL}>
              <span className="sr-only">{fromCopy(copy, 'moderationForm.surgery.mergeSr')}</span>
              <input
                type="number"
                name="targetThreadId"
                required
                min={1}
                step={1}
                placeholder={fromCopy(copy, 'moderationForm.surgery.mergePlaceholder')}
                className={`${FIELD} w-40`}
              />
            </label>
            <PendingButton
              showWorking
              className={`${BUTTON} border-destructive/40 text-destructive`}
            >
              {fromCopy(copy, 'moderationForm.surgery.merge')}
            </PendingButton>
          </div>
          <FormError message={mergeState.error} />
        </form>
      )}
    </>
  )
}
