'use client'

import { useActionState } from 'react'

import { TextLink } from '@meith/ui'

import { registerAction } from '@/server/auth-actions'
import { EMPTY_STATE } from '@/server/auth-form-state'

import { CustomField, type CustomFieldInput } from '../profile/custom-field'
import { type Copy, fromCopy } from '../shell/copy'
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
  copy,
}: {
  customFields?: readonly CustomFieldInput[]
  challenge?: ChallengeInput
  limits: RegistrationLimits
  terms?: TermsInput | null | undefined
  copy: Copy
}) {
  const [state, action] = useActionState(registerAction, EMPTY_STATE)
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        label={fromCopy(copy, 'authForm.register.username')}
        name="username"
        autoComplete="username"
        minLength={limits.usernameMin}
        maxLength={limits.usernameMax}
        defaultValue={state.values?.username}
        hint={fromCopy(copy, 'authForm.register.usernameHint')}
      />
      <Field
        label={fromCopy(copy, 'authForm.email')}
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
      />
      <Field
        label={fromCopy(copy, 'authForm.register.password')}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={limits.minPasswordLength}
        hint={fromCopy(copy, 'authForm.passwordHint')}
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
              <label htmlFor="contact_url">{fromCopy(copy, 'authForm.register.honeypot')}</label>
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
              hint={fromCopy(copy, 'authForm.register.challengeHint')}
            />
          )}
        </>
      )}

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          name="announcements"
          value="1"
          defaultChecked={state.values?.announcements === '1'}
          className="mt-0.5 size-4 rounded border-input accent-primary"
        />
        <span>
          <span className="block text-foreground">
            {fromCopy(copy, 'authForm.register.announcements')}
          </span>
          <span className="block text-xs">
            {fromCopy(copy, 'authForm.register.announcementsHint')}
          </span>
        </span>
      </label>

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
            {copy['authForm.register.termsLead']}
            <TextLink href={terms.href} target="_blank" rel="noreferrer">
              {terms.label}
            </TextLink>
            {copy['authForm.register.termsTail']}
          </span>
        </label>
      )}

      <SubmitButton>{fromCopy(copy, 'authForm.register.submit')}</SubmitButton>
    </form>
  )
}
