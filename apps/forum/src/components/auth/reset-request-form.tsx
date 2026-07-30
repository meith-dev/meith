"use client"

import { useActionState } from "react"

import { requestResetAction } from "@/server/auth-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { Field, FormError, FormNotice, SubmitButton } from "./form-controls"

export function ResetRequestForm() {
  const [state, action] = useActionState(requestResetAction, EMPTY_STATE)
  const devToken = state.values?.devToken
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormNotice message={state.notice} />
      <FormError message={state.error} />
      {/* Dev-only affordance: with no mailer wired, surface the reset link so the
          flow is demonstrable. A real deployment emails it and never renders this. */}
      {devToken ? (
        <a
          href={`/reset/confirm?token=${devToken}`}
          className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground underline underline-offset-2"
        >
          Continue to reset your password
        </a>
      ) : null}
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <SubmitButton>Send reset link</SubmitButton>
    </form>
  )
}
