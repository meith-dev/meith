'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { setAvatarLockAction, setSignatureLockAction } from '@/server/moderation-actions'

import { FormError } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'

const REASON_INPUT = 'h-8 rounded-md border border-border bg-background px-2 text-xs'
const LOCK_BUTTON =
  'text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function SignatureLockForm({
  userId,
  locked,
  copy,
}: {
  userId: number
  locked: boolean
  copy: Copy
}) {
  const [state, action] = useActionState(setSignatureLockAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <FormError message={state.error} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="locked" value={locked ? '0' : '1'} />

      {locked ? null : (
        <input
          name="reason"
          placeholder={fromCopy(copy, 'moderationForm.lock.why')}
          className={REASON_INPUT}
          required
        />
      )}

      <button type="submit" className={LOCK_BUTTON}>
        {locked
          ? fromCopy(copy, 'moderationForm.lock.unlockSignature')
          : fromCopy(copy, 'moderationForm.lock.signature')}
      </button>
    </form>
  )
}

export function AvatarLockForm({
  userId,
  locked,
  copy,
}: {
  userId: number
  locked: boolean
  copy: Copy
}) {
  const [state, action] = useActionState(setAvatarLockAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <FormError message={state.error} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="locked" value={locked ? '0' : '1'} />

      {locked ? null : (
        <input
          name="reason"
          placeholder={fromCopy(copy, 'moderationForm.lock.why')}
          className={REASON_INPUT}
          required
        />
      )}

      <button type="submit" className={LOCK_BUTTON}>
        {locked
          ? fromCopy(copy, 'moderationForm.lock.unlockAvatar')
          : fromCopy(copy, 'moderationForm.lock.avatar')}
      </button>
    </form>
  )
}
