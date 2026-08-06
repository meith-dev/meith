"use client"

/**
 * F63's two ACP forms.
 *
 * The sign-in form is the one place on this board that mints elevated
 * authority. It carries `next` as a hidden field rather than reading the URL,
 * so the value that is validated server-side is the value that was rendered —
 * and it is validated to `/admin` and nothing else.
 */
import { useActionState } from "react"

import { adminSignInAction, adminSignOutAction } from "@/server/admin-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError } from "../auth/form-controls"

export function AdminSignInForm({
  next,
  reason,
  idleMinutes,
}: {
  next: string
  /** Set when a destructive operation asked for the password again. */
  reason: "expired" | "reauth" | null
  idleMinutes: number
}) {
  const [state, action] = useActionState(adminSignInAction, EMPTY_STATE)

  return (
    <form
      action={action}
      className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-card p-6"
    >
      <h1 className="text-xl font-semibold tracking-tight">Control panel</h1>

      <p className="text-sm text-muted-foreground">
        {reason === "reauth"
          ? "Confirm your password to continue. Some actions ask again even while you are signed in."
          : reason === "expired"
            ? "Your control panel session has expired."
            : "Confirm your password. This is separate from your board session."}
      </p>

      <FormError message={state.error} />
      <input type="hidden" name="next" value={next} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </label>

      <button
        type="submit"
        className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Enter the control panel
      </button>

      <p className="text-xs text-muted-foreground">
        The panel signs you out after {idleMinutes} minutes of inactivity. Your
        board session is not affected.
      </p>
    </form>
  )
}

export function AdminSignOutForm() {
  return (
    <form action={adminSignOutAction}>
      <button
        type="submit"
        className="text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Leave the control panel
      </button>
    </form>
  )
}
