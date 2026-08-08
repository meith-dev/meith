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
      {/* Development-only affordance. `devToken` is only ever populated when
          NODE_ENV is development (see requestResetAction); outside development the
          server never sends it, so this branch cannot render a live reset token to
          a visitor. The check there is the security boundary — not this one. */}
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
