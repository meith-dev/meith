"use client"

import { useActionState } from "react"

import { registerAction } from "@/server/auth-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { CustomField, type CustomFieldInput } from "../profile/custom-field"
import { Field, FormError, SubmitButton } from "./form-controls"

/** The same input styling `Field` uses, for F59's custom controls. */
const CONTROL =
  "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"

export interface ChallengeInput {
  /** The question to ask, or `null` when the board asks none. */
  readonly prompt: string | null
  /** Echoed back so the server knows which question was asked. */
  readonly token: string
  readonly honeypot: boolean
  readonly issuedAt: number
}

/**
 * The board's own limits, so the form asks for what the server will accept.
 *
 * Passed in rather than imported: they are settings now (F13), and a hint that
 * says "at least 8 characters" on a board that refuses anything under 16 is a
 * form that rejects what it just asked for. The server is still the only
 * enforcement — these are `minLength` attributes and words.
 */
export interface RegistrationLimits {
  readonly minPasswordLength: number
  readonly usernameMin: number
  readonly usernameMax: number
}

export function RegisterForm({
  customFields = [],
  challenge,
  limits,
}: {
  /**
   * F59's fields the operator marked required at registration, already
   * resolved to the ones the default member group may edit.
   */
  customFields?: readonly CustomFieldInput[]
  /** F46. Absent on a board with nothing switched on. */
  challenge?: ChallengeInput
  limits: RegistrationLimits
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
      {/*
        Below the credentials rather than above: an applicant is here to make an
        account, and a board that opens with four operator questions loses
        people before the username box. The server enforces them either way.
      */}
      {customFields.map((field) => (
        <CustomField key={field.key} field={field} className={CONTROL} />
      ))}

      {/*
        F46. Everything here is plain markup in a native form — no script runs,
        so the checks work with JavaScript disabled, which matters because a
        board that only stops scripted registration when the *visitor* runs
        scripts has stopped nothing.
      */}
      {challenge !== undefined && (
        <>
          <input type="hidden" name="_issued" value={challenge.issuedAt} />
          <input type="hidden" name="_challenge" value={challenge.token} />

          {challenge.honeypot && (
            /*
              The trap. Hidden from sight *and* from assistive technology, and
              taken out of the tab order: a screen-reader user who filled this
              in would be refused for using the page correctly, which is the way
              this control usually gets accessibility wrong.
            */
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

      <SubmitButton>Create account</SubmitButton>
    </form>
  )
}
