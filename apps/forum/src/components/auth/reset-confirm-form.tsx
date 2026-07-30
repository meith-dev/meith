"use client"

import { useActionState } from "react"

import { confirmResetAction } from "@/server/auth-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { Field, FormError, SubmitButton } from "./form-controls"

export function ResetConfirmForm({ token }: { token: string }) {
  const [state, action] = useActionState(confirmResetAction, EMPTY_STATE)
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <input type="hidden" name="token" value={token} />
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        hint="At least 8 characters."
      />
      <Field
        label="Confirm new password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        minLength={8}
      />
      <SubmitButton>Set new password</SubmitButton>
    </form>
  )
}
