"use client"

/**
 * Presentational building blocks shared by every form on the board.
 *
 * The name says `auth` and the imports say otherwise: twenty-odd modules across
 * the admin panel, the moderation tools and the account screens pull `Field`,
 * `FormError`, `FormNotice` and `SubmitButton` from here. That makes this file
 * the app's form vocabulary, so it is built out of `@meith/ui` rather than out
 * of hand-written class strings — which is what it was, and why an input here
 * and an input in a theme slot had subtly different heights, borders and focus
 * treatments.
 *
 * `SubmitButton` uses `useFormStatus`, so it must live in a client component —
 * but it degrades cleanly: with JS off there is no pending state and the button
 * simply submits. Nothing here is required for a form to function without
 * scripting; it only adds the pending affordance and the inline messaging. That
 * is also the one place on the board that earns Base UI's `Button` rather than
 * `buttonVariants` on a plain `<button>` — see `packages/ui/src/variants.ts`.
 */
import { Alert, AlertDescription, AlertTitle, Field as UiField, Input } from "@meith/ui"
import { Button } from "@meith/ui/button"
import { useFormStatus } from "react-dom"

/**
 * The submit control.
 *
 * `disabled` while pending stops the double submit that produces two threads
 * from one impatient double-click, and the label changes because a button that
 * greys out with no explanation reads as broken. The width is the caller's:
 * an auth form wants a full-width button and an admin form beside a cancel link
 * does not.
 */
export function SubmitButton({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      variant="primary"
      size="lg"
      disabled={pending}
      className={className ?? "w-full"}
    >
      {pending ? "Working…" : children}
    </Button>
  )
}

/**
 * A top-of-form error.
 *
 * `Alert` resolves `role="alert"` from the `error` tone, so this is announced on
 * submit without every call site having to remember the attribute — which is
 * the sort of thing that is right in nineteen files and missing in the
 * twentieth.
 */
export function FormError({ message }: { message?: string | undefined }) {
  if (!message) return null
  return (
    <Alert tone="error">
      <AlertDescription>
        <AlertTitle>Not saved.</AlertTitle> {message}
      </AlertDescription>
    </Alert>
  )
}

/** A non-error confirmation (e.g. "check your email"). Announced politely. */
export function FormNotice({ message }: { message?: string | undefined }) {
  if (!message) return null
  return (
    <Alert tone="success">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

// `| undefined` on the optionals is required by exactOptionalPropertyTypes:
// several of these receive `state.values?.x` from useActionState, which is
// genuinely `string | undefined` on the first (empty-state) render.
interface FieldProps {
  label: string
  name: string
  type?: string | undefined
  autoComplete?: string | undefined
  required?: boolean | undefined
  defaultValue?: string | undefined
  minLength?: number | undefined
  /** Mirrors a server-side limit; never the only enforcement of one. */
  maxLength?: number | undefined
  hint?: string | undefined
  /** A per-field validation message from the server. Marks the input invalid. */
  error?: string | undefined
  /** Disambiguates two forms on one page that share a field name. */
  id?: string | undefined
}

/**
 * A labelled text input.
 *
 * The label is associated by `for`/`id` rather than by wrapping the control,
 * which is what this used to do. Wrapping works for a bare input and stops
 * working the moment a field grows a hint, an error or a second control — the
 * association silently widens to whatever else ended up inside the `<label>`,
 * and clicking the hint focuses the box.
 */
export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  defaultValue,
  minLength,
  maxLength,
  hint,
  error,
  id,
}: FieldProps) {
  return (
    <UiField
      name={name}
      label={label}
      error={error ?? null}
      {...(id === undefined ? {} : { id })}
      {...(hint === undefined ? {} : { description: hint })}
    >
      {(control) => (
        <Input
          {...control}
          type={type}
          required={required}
          {...(autoComplete === undefined ? {} : { autoComplete })}
          {...(defaultValue === undefined ? {} : { defaultValue })}
          {...(minLength === undefined ? {} : { minLength })}
          {...(maxLength === undefined ? {} : { maxLength })}
        />
      )}
    </UiField>
  )
}
