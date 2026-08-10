"use client"

import { useActionState } from "react"

import { resendVerificationAction } from "@/server/auth-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { Field, FormError, FormNotice, SubmitButton } from "./form-controls"

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
