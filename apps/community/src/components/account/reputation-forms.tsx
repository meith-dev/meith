'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { rateMemberAction, withdrawRatingAction } from '@/server/reputation-actions'

import { FormError } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'

const FIELD =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const CARD = 'flex flex-col gap-3 rounded-lg border border-border bg-card p-5'

const CHOICE =
  'inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function RateMemberForm({
  userId,
  postId = null,
  returnTo,
  allowNegative,
  commentRequired,
  existingComment = null,
  existingPoints = null,
  remainingLabel = null,
  copy,
}: {
  userId: number
  postId?: number | null
  returnTo: string
  allowNegative: boolean
  commentRequired: boolean
  existingComment?: string | null
  existingPoints?: number | null
  remainingLabel?: string | null
  copy: Copy
}) {
  const [state, action] = useActionState(rateMemberAction, EMPTY_STATE)

  return (
    <form action={action} className={CARD}>
      <FormError message={state.error} />
      <input type="hidden" name="userId" value={userId} />
      {postId === null ? null : <input type="hidden" name="postId" value={postId} />}
      <input type="hidden" name="returnTo" value={returnTo} />

      <h2 className="text-lg font-semibold tracking-tight">
        {existingPoints === null
          ? fromCopy(copy, 'accountForm.rate.title')
          : fromCopy(copy, 'accountForm.rate.changeTitle')}
      </h2>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">
          {commentRequired
            ? fromCopy(copy, 'accountForm.rate.why')
            : fromCopy(copy, 'accountForm.rate.whyOptional')}
        </span>
        <textarea
          name="comment"
          defaultValue={state.values?.comment ?? existingComment ?? ''}
          className={FIELD}
          rows={3}
          maxLength={500}
          required={commentRequired}
        />
        <span className="text-xs text-muted-foreground">
          {fromCopy(copy, 'accountForm.rate.whyHint')}
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" name="points" value="1" className={CHOICE}>
          {allowNegative
            ? fromCopy(copy, 'accountForm.rate.positive')
            : fromCopy(copy, 'accountForm.rate.thanks')}
        </button>
        <button type="submit" name="points" value="0" className={CHOICE}>
          {allowNegative
            ? fromCopy(copy, 'accountForm.rate.neutral')
            : fromCopy(copy, 'accountForm.rate.justComment')}
        </button>
        {allowNegative && (
          <button type="submit" name="points" value="-1" className={CHOICE}>
            {fromCopy(copy, 'accountForm.rate.negative')}
          </button>
        )}
      </div>

      {remainingLabel !== null && <p className="text-xs text-muted-foreground">{remainingLabel}</p>}
    </form>
  )
}

export function WithdrawRatingForm({
  ratingId,
  userId,
  returnTo,
  copy,
}: {
  ratingId: number
  userId: number
  returnTo: string
  copy: Copy
}) {
  const [state, action] = useActionState(withdrawRatingAction, EMPTY_STATE)

  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <FormError message={state.error} />
      <input type="hidden" name="ratingId" value={ratingId} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {fromCopy(copy, 'accountForm.rate.withdraw')}
      </button>
    </form>
  )
}
