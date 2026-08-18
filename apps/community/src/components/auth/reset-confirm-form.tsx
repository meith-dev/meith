'use client'

import { useActionState } from 'react'

import { confirmResetAction } from '@/server/auth-actions'
import { EMPTY_STATE } from '@/server/auth-form-state'

import { type Copy, fromCopy } from '../shell/copy'
import { Field, FormError, SubmitButton } from './form-controls'

export function ResetConfirmForm({
  token,
  minLength,
  copy,
}: {
  token: string
  minLength: number
  copy: Copy
}) {
  const [state, action] = useActionState(confirmResetAction, EMPTY_STATE)
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <input type="hidden" name="token" value={token} />
      <Field
        label={fromCopy(copy, 'authForm.resetConfirm.password')}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={minLength}
        hint={fromCopy(copy, 'authForm.passwordHint')}
      />
      <Field
        label={fromCopy(copy, 'authForm.resetConfirm.confirm')}
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength={minLength}
      />
      <SubmitButton>{fromCopy(copy, 'authForm.resetConfirm.submit')}</SubmitButton>
    </form>
  )
}
