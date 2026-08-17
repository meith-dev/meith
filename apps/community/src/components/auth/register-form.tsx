'use client'

import { useActionState } from 'react'

import { registerAction } from '@/server/auth-actions'
import { EMPTY_STATE } from '@/server/auth-form-state'

import { CustomField, type CustomFieldInput } from '../profile/custom-field'
import { Field, FormError, SubmitButton } from './form-controls'

const CONTROL =
  'h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'

export interface ChallengeInput {
  readonly prompt: string | null
  readonly token: string
  readonly honeypot: boolean
  readonly issuedAt: number
}

export interface RegistrationLimits {
  readonly minPasswordLength: number
  readonly usernameMin: number
  readonly usernameMax: number
}

export interface TermsInput {
  readonly label: string
  readonly href: string
}

export function RegisterForm({
  customFields = [],
  challenge,
  limits,
  terms = null,
}: {
  customFields?: readonly CustomFieldInput[]
  challenge?: ChallengeInput
  limits: RegistrationLimits
  terms?: TermsInput | null | undefined
}) {
  const [state, action] = useActionState(registerAction, EMPTY_STATE)
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        label="Username"
        name="username"
        autoComplete="username"
        minLength={limits.usernameMin}
        maxLength={limits.usernameMax}
        defaultValue={state.values?.username}
        hint={`${limits.usernameMin}–${limits.usernameMax} characters: letters, numbers, and _ - .`}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={limits.minPasswordLength}
        hint={`At least ${limits.minPasswordLength} characters.`}
      />
      {customFields.map((field) => (
        <CustomField key={field.key} field={field} className={CONTROL} />
      ))}

      {challenge !== undefined && (
        <>
          <input type="hidden" name="_issued" value={challenge.issuedAt} />
          <input type="hidden" name="_challenge" value={challenge.token} />

          {challenge.honeypot && (
            <div aria-hidden="true" className="hidden">
              <label htmlFor="contact_url">Leave this field empty</label>
              <input
                id="contact_url"
                name="contact_url"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                defaultValue=""
              />
            </div>
          )}

          {challenge.prompt !== null && (
            <Field
              label={challenge.prompt}
              name="challenge_answer"
              autoComplete="off"
              hint="A question set by this board, to show you are not a script."
            />
          )}
        </>
      )}

      {terms !== null && (
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            name="terms"
            value="1"
            required
            defaultChecked={state.values?.terms === '1'}
            className="mt-0.5 size-4 rounded border-input accent-primary"
          />
          <span>
            I have read and accept the{' '}
            <a
              href={terms.href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
            >
              {terms.label}
            </a>
            .
          </span>
        </label>
      )}

      <SubmitButton>Create account</SubmitButton>
    </form>
  )
}
