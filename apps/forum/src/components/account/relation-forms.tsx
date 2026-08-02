"use client"

/**
 * F61's two buttons.
 *
 * Forms rather than links, because both change state: a GET that adds somebody
 * to an ignore list is fired by every prefetcher and link scanner that touches
 * the page. Client components only for `useActionState`; both submit natively
 * with scripting off.
 */
import { useActionState } from "react"

import { removeRelationAction, setRelationAction } from "@/server/relation-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError } from "../auth/form-controls"

const LINK_BUTTON =
  "text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

const QUIET_BUTTON =
  "text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

export function SetRelationForm({
  userId,
  username,
  kind,
  returnTo,
  label,
}: {
  userId: number
  username: string
  kind: "buddy" | "ignore"
  returnTo: string
  label: string
}) {
  const [state, action] = useActionState(setRelationAction, EMPTY_STATE)

  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <FormError message={state.error} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="username" value={username} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button type="submit" className={kind === "buddy" ? LINK_BUTTON : QUIET_BUTTON}>
        {label}
      </button>
    </form>
  )
}

export function RemoveRelationForm({
  userId,
  username,
  returnTo,
  label = "Remove",
}: {
  userId: number
  username: string
  returnTo: string
  label?: string
}) {
  const [state, action] = useActionState(removeRelationAction, EMPTY_STATE)

  return (
    <form action={action} className="inline-flex flex-col gap-1">
      <FormError message={state.error} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="username" value={username} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button type="submit" className={QUIET_BUTTON}>
        {label}
      </button>
    </form>
  )
}
