'use client'

/**
 * F83 — the install form.
 *
 * A client component for exactly one reason: `useActionState`, which is how
 * every form on this board reports a validation error. It is otherwise a plain
 * `<form>` with named inputs posting to a Server Action, so it works with
 * scripting disabled — the field errors arrive on the re-rendered page rather
 * than beside the input, which is the documented no-JS trade (R5).
 *
 * That matters more here than anywhere else: this is the first page a new
 * operator loads, on a fresh deployment, possibly from a phone on a bad
 * connection. An installer that needs JavaScript to submit is an installer that
 * sometimes cannot.
 */

import { useActionState } from 'react'

import { installAction, type InstallFormState } from '@/server/install-actions'

const EMPTY: InstallFormState = {}

const INPUT =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function InstallForm() {
  const [state, submit, pending] = useActionState(installAction, EMPTY)

  return (
    <form action={submit} className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <h2 className="font-serif text-xl font-semibold">Your board</h2>

      {state.errors?.form !== undefined && (
        <p role="alert" className="rounded-md border border-destructive bg-destructive/5 px-3 py-2 text-sm">
          {state.errors.form}
        </p>
      )}

      {state.failedStep !== undefined && (
        /*
         * Which step, not just "it failed". The steps are listed above this form,
         * so naming one tells the operator exactly how far the board got — and
         * whether trying again is safe or whether they now have a half-installed
         * board to look at.
         */
        <p role="alert" className="rounded-md border border-destructive bg-destructive/5 px-3 py-2 text-sm">
          <span className="font-medium">The “{state.failedStep.id}” step failed.</span>{' '}
          {state.failedStep.error}
        </p>
      )}

      <Field
        name="boardName"
        label="Board name"
        defaultValue={state.values?.boardName ?? ''}
        error={state.errors?.boardName}
        autoComplete="organization"
      />
      <Field
        name="username"
        label="Administrator’s name"
        defaultValue={state.values?.username ?? ''}
        error={state.errors?.username}
        autoComplete="username"
      />
      <Field
        name="email"
        label="Administrator’s e-mail"
        type="email"
        defaultValue={state.values?.email ?? ''}
        error={state.errors?.email}
        autoComplete="email"
      />
      <Field
        name="password"
        label="Administrator’s password"
        type="password"
        /*
         * Never echoed back on a failed submit — unlike the three fields above,
         * which are. A password re-rendered into HTML is a password in a proxy
         * log and in the browser's back-forward cache.
         */
        defaultValue=""
        error={state.errors?.password}
        autoComplete="new-password"
        hint="At least 12 characters. This account can reconfigure the board."
      />

      <div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {pending ? 'Installing…' : 'Install'}
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        Pressing this applies every migration and creates the account above. When
        it finishes, this page stops existing.
      </p>
    </form>
  )
}

function Field({
  name,
  label,
  error,
  hint,
  type = 'text',
  defaultValue,
  autoComplete,
}: {
  name: string
  label: string
  error?: string | undefined
  hint?: string | undefined
  type?: string
  defaultValue: string
  autoComplete?: string
}) {
  const describedBy = [error !== undefined ? `${name}-error` : null, hint !== undefined ? `${name}-hint` : null]
    .filter((id): id is string => id !== null)
    .join(' ')

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        required
        aria-invalid={error !== undefined}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        className={INPUT}
      />
      {hint !== undefined && (
        <span id={`${name}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </span>
      )}
      {error !== undefined && (
        <span id={`${name}-error`} className="text-xs text-destructive">
          {error}
        </span>
      )}
    </label>
  )
}
