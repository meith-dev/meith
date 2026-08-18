'use client'

import { useActionState } from 'react'

import { loginAction } from '@/server/auth-actions'
import { EMPTY_STATE } from '@/server/auth-form-state'

import { type Copy, fromCopy } from '../shell/copy'
import { Field, FormError, FormNotice, SubmitButton } from './form-controls'

interface LoginFormProps {
  next?: string | undefined
  notice?: string | undefined
  copy: Copy
}

export function LoginForm({ next, notice, copy }: LoginFormProps) {
  const [state, action] = useActionState(loginAction, EMPTY_STATE)
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormNotice message={notice} />
      <FormError message={state.error} />
      <Field
        label={fromCopy(copy, 'authForm.login.identifier')}
        name="identifier"
        autoComplete="username"
        defaultValue={state.values?.identifier}
      />
      <Field
        label={fromCopy(copy, 'authForm.login.password')}
        name="password"
        type="password"
        autoComplete="current-password"
      />
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          name="remember"
          className="size-4 rounded border-input accent-primary"
        />
        {fromCopy(copy, 'authForm.login.remember')}
      </label>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <SubmitButton>{fromCopy(copy, 'authForm.login.submit')}</SubmitButton>
    </form>
  )
}
