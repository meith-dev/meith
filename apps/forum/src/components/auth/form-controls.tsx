"use client"

/**
 * Presentational building blocks shared by every auth form.
 *
 * `SubmitButton` uses `useFormStatus`, so it must live in a client component —
 * but it degrades cleanly: with JS off there is no pending state, the button
 * simply submits. Nothing here is required for the form to function without
 * scripting; it only adds the pending affordance and inline messaging.
 */
import { useFormStatus } from "react-dom"

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
    >
      {pending ? "Working…" : children}
    </button>
  )
}

/** A top-of-form error alert. `role="alert"` so it is announced on submit. */
export function FormError({ message }: { message?: string | undefined }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  )
}

/** A non-error confirmation (e.g. "check your email"). */
export function FormNotice({ message }: { message?: string | undefined }) {
  if (!message) return null
  return (
    <p
      role="status"
      className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground"
    >
      {message}
    </p>
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
  hint?: string | undefined
}

export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  defaultValue,
  minLength,
  hint,
}: FieldProps) {
  const hintId = hint ? `${name}-hint` : undefined
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        minLength={minLength}
        aria-describedby={hintId}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      {hint ? (
        <span id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  )
}
