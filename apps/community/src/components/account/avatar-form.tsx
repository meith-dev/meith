'use client'

import { useActionState } from 'react'

import { AVATAR_BOX } from '@meith/avatars/limits'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { removeAvatarAction, saveAvatarAction } from '@/server/usercp-actions'

import { FormError, SubmitButton } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'

const CARD = 'flex flex-col gap-3 rounded-lg border border-border bg-card p-4'

export function AvatarForm({
  currentUrl,
  status,
  failureReason,
  locked,
  lockedReason,
  copy,
}: {
  currentUrl: string | null
  status: 'none' | 'pending' | 'ready' | 'failed'
  failureReason: string | null
  locked: boolean
  lockedReason: string | null
  copy: Copy
}) {
  const [saveState, save] = useActionState(saveAvatarAction, EMPTY_STATE)
  const [removeState, remove] = useActionState(removeAvatarAction, EMPTY_STATE)

  if (locked) {
    return (
      <div className={CARD}>
        <h2 className="text-lg font-semibold tracking-tight">
          {fromCopy(copy, 'accountForm.avatar.lockedTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {fromCopy(copy, 'accountForm.avatar.lockedBody')}
          {lockedReason === null ? null : (
            <>
              {' '}
              {copy['accountForm.locked.reasonLead']}
              <span className="text-foreground">{lockedReason}</span>
              {copy['accountForm.locked.reasonTail']}
            </>
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={CARD}>
        <h2 className="text-lg font-semibold tracking-tight">
          {fromCopy(copy, 'accountForm.avatar.title')}
        </h2>

        {status === 'pending' && (
          <p className="text-sm text-muted-foreground">
            {fromCopy(copy, 'accountForm.avatar.pending')}
          </p>
        )}
        {status === 'failed' && (
          <p className="text-sm text-muted-foreground">
            {failureReason ?? fromCopy(copy, 'accountForm.avatar.failed')}
          </p>
        )}

        {currentUrl === null ? (
          <p className="text-sm text-muted-foreground">
            {fromCopy(copy, 'accountForm.avatar.none')}
          </p>
        ) : (
          <img
            src={currentUrl}
            alt={fromCopy(copy, 'accountForm.avatar.title')}
            width={AVATAR_BOX.width}
            height={AVATAR_BOX.height}
            className="h-24 w-24 rounded-md border border-border object-cover"
          />
        )}
      </div>

      <form action={save} className={CARD} noValidate>
        <FormError message={saveState.error} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{fromCopy(copy, 'accountForm.avatar.choose')}</span>
          <input
            type="file"
            name="avatar"
            accept=".png,.jpg,.jpeg"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm"
          />
          <span className="text-xs text-muted-foreground">
            {fromCopy(copy, 'accountForm.avatar.hint')}
          </span>
        </label>
        <div>
          <SubmitButton>{fromCopy(copy, 'accountForm.avatar.upload')}</SubmitButton>
        </div>
      </form>

      {currentUrl !== null && (
        <form action={remove} className={CARD} noValidate>
          <FormError message={removeState.error} />
          <p className="text-sm text-muted-foreground">
            {fromCopy(copy, 'accountForm.avatar.removeBlurb')}
          </p>
          <div>
            <SubmitButton>{fromCopy(copy, 'accountForm.avatar.remove')}</SubmitButton>
          </div>
        </form>
      )}
    </div>
  )
}
