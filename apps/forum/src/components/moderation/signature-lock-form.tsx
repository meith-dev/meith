"use client"

/**
 * F58's moderator control.
 *
 * A form rather than a link, because it changes state — and the reason box is
 * required when locking, because the member is shown this text on their own
 * signature screen.
 */
import { useActionState } from "react"

import { setSignatureLockAction } from "@/server/moderation-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError } from "../auth/form-controls"

export function SignatureLockForm({
  userId,
  locked,
}: {
  userId: number
  locked: boolean
}) {
  const [state, action] = useActionState(setSignatureLockAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <FormError message={state.error} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="locked" value={locked ? "0" : "1"} />

      {locked ? null : (
        <input
          name="reason"
          placeholder="Why (shown to the member)"
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
          required
        />
      )}

      <button
        type="submit"
        className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {locked ? "Unlock their signature" : "Lock their signature"}
      </button>
    </form>
  )
}
