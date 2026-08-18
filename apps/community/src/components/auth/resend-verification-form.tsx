'use client'

import { useActionState } from 'react'

import { resendVerificationAction } from '@/server/auth-actions'
import { EMPTY_STATE } from '@/server/auth-form-state'

import { type Copy, fromCopy } from '../shell/copy'
import { Field, FormError, FormNotice, SubmitButton } from './form-controls'

export function ResendVerificationForm({
  email,
  copy,
}: {
  email?: string | undefined
  copy: Copy
}) {
  const [state, action] = useActionState(resendVerificationAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormNotice message={state.notice} />
      <FormError message={state.error} />
      <Field
        label={fromCopy(copy, 'authForm.email')}
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email ?? email}
      />
      <SubmitButton>{fromCopy(copy, 'authForm.resend.submit')}</SubmitButton>
    </form>
  )
}
