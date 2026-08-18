'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { mergeThreadAction, splitThreadAction } from '@/server/surgery-actions'

import { FormError } from '../auth/form-controls'
import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'

const BUTTON =
  'inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const FIELD =
  'h-8 rounded-md border border-border bg-background px-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

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
        <form action={splitAction} className="flex flex-wrap items-center gap-2">
          <FormError message={splitState.error} />
          <input type="hidden" name="threadId" value={threadId} />
          <label className="flex items-center gap-2 text-xs">
            <span className="sr-only">{fromCopy(copy, 'moderationForm.surgery.fromSr')}</span>
            <select name="fromPostId" className={FIELD}>
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
          <label className="flex items-center gap-2 text-xs">
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
          <button type="submit" className={BUTTON}>
            {fromCopy(copy, 'moderationForm.surgery.split')}
          </button>
        </form>
      )}

      {rights.merge && (
        <form action={mergeAction} className="flex flex-wrap items-center gap-2">
          <FormError message={mergeState.error} />
          <input type="hidden" name="threadId" value={threadId} />
          <label className="flex items-center gap-2 text-xs">
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
          <button type="submit" className={`${BUTTON} border-destructive/40 text-destructive`}>
            {fromCopy(copy, 'moderationForm.surgery.merge')}
          </button>
        </form>
      )}
    </>
  )
}
