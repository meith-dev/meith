"use client"

/**
 * F58's moderator controls, for both halves.
 *
 * Forms rather than links, because they change state — and the reason box is
 * required when locking, because the member is shown that text on their own
 * screen.
 *
 * Two components over one generic one: the two actions differ in what they
 * refuse and in what an appeal can recover afterwards (a locked signature keeps
 * readable text; a locked avatar keeps a file nobody can see), and a shared
 * component parameterised by verb would flatten a distinction worth keeping
 * visible in the markup.
 */
import { useActionState } from "react"

import { setAvatarLockAction, setSignatureLockAction } from "@/server/moderation-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError } from "../auth/form-controls"

const REASON_INPUT =
  "h-8 rounded-md border border-border bg-background px-2 text-xs"
const LOCK_BUTTON =
  "text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

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
          className={REASON_INPUT}
          required
        />
      )}

      <button
        type="submit"
        className={LOCK_BUTTON}
      >
        {locked ? "Unlock their signature" : "Lock their signature"}
      </button>
    </form>
  )
}

/** The same act on the avatar. See `setAvatarLockAction` for why it is `user.warn`. */
export function AvatarLockForm({
  userId,
  locked,
}: {
  userId: number
  locked: boolean
}) {
  const [state, action] = useActionState(setAvatarLockAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <FormError message={state.error} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="locked" value={locked ? "0" : "1"} />

      {locked ? null : (
        <input
          name="reason"
          placeholder="Why (shown to the member)"
          className={REASON_INPUT}
          required
        />
      )}

      <button type="submit" className={LOCK_BUTTON}>
        {locked ? "Unlock their avatar" : "Lock their avatar"}
      </button>
    </form>
  )
}
