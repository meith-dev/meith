"use client"

import { useActionState } from "react"

import { registerAction } from "@/server/auth-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { Field, FormError, SubmitButton } from "./form-controls"

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, EMPTY_STATE)
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <FormError message={state.error} />
      <Field
        label="Username"
        name="username"
        autoComplete="username"
        minLength={3}
        defaultValue={state.values?.username}
        hint="3–30 characters: letters, numbers, and _ - ."
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
        minLength={8}
        hint="At least 8 characters."
      />
      <SubmitButton>Create account</SubmitButton>
    </form>
  )
}
