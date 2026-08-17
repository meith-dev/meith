'use client'

import { useActionState } from 'react'

import { requestResetAction } from '@/server/auth-actions'
import { EMPTY_STATE } from '@/server/auth-form-state'

import { type Copy, fromCopy } from '../shell/copy'
import { Field, FormError, FormNotice, SubmitButton } from './form-controls'

export function ResetRequestForm({ copy }: { copy: Copy }) {
  const [state, action] = useActionState(requestResetAction, EMPTY_STATE)
  const devToken = state.values?.devToken
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormNotice message={state.notice} />
      <FormError message={state.error} />
      {devToken ? (
        <a
          href={`/reset/confirm?token=${devToken}`}
          className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground underline underline-offset-2"
        >
          {fromCopy(copy, 'authForm.reset.continue')}
        </a>
      ) : null}
      <Field
        label={fromCopy(copy, 'authForm.email')}
        name="email"
        type="email"
        autoComplete="email"
      />
      <SubmitButton>{fromCopy(copy, 'authForm.reset.submit')}</SubmitButton>
    </form>
  )
}
