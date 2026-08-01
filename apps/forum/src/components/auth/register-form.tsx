"use client"

import { useActionState } from "react"

import { registerAction } from "@/server/auth-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { CustomField, type CustomFieldInput } from "../profile/custom-field"
import { Field, FormError, SubmitButton } from "./form-controls"

/** The same input styling `Field` uses, for F59's custom controls. */
const CONTROL =
  "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"

export function RegisterForm({
  customFields = [],
}: {
  /**
   * F59's fields the operator marked required at registration, already
   * resolved to the ones the default member group may edit.
   */
  customFields?: readonly CustomFieldInput[]
}) {
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
      {/*
        Below the credentials rather than above: an applicant is here to make an
        account, and a board that opens with four operator questions loses
        people before the username box. The server enforces them either way.
      */}
      {customFields.map((field) => (
        <CustomField key={field.key} field={field} className={CONTROL} />
      ))}
      <SubmitButton>Create account</SubmitButton>
    </form>
  )
}
