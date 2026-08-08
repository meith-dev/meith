"use client"

import { useActionState } from "react"

import { resendVerificationAction } from "@/server/auth-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { Field, FormError, FormNotice, SubmitButton } from "./form-controls"

/**
 * Ask for another confirmation link.
 *
 * The address is prefilled from the query when we know it — somebody arriving
 * straight from registration should not have to retype what they just typed —
 * but the field stays editable, because the commonest reason to be on this
 * screen is having typed it wrong the first time.
 */
export function ResendVerificationForm({ email }: { email?: string | undefined }) {
  const [state, action] = useActionState(resendVerificationAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormNotice message={state.notice} />
      <FormError message={state.error} />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email ?? email}
      />
      <SubmitButton>Send another link</SubmitButton>
    </form>
  )
}
