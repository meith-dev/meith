"use client"

/**
 * F56's forms.
 *
 * Client components only for `useActionState`, like every other form on the
 * board. All of them work with scripting off: a native `<select>` with a submit
 * button beside it rather than an on-change handler, because an on-change
 * handler is a control that silently does nothing without JavaScript.
 */
import { useActionState } from "react"

import { subscribeAction, unsubscribeAction, unsubscribeByTokenAction } from "@/server/subscription-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError } from "../auth/form-controls"

const BUTTON =
  "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

const QUIET_BUTTON =
  "inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

const FIELD =
  "rounded-md border border-border bg-background px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

export interface ModeOption {
  readonly value: string
  readonly label: string
}

/**
 * The control on a thread or forum page.
 *
 * One form for three states — not following, following, changing cadence —
 * because they are one act from the member's side and the server treats them
 * as one (`subscribe` is an upsert). The unsubscribe button is a separate form
 * because it posts to a different action.
 */
export function FollowForm({
  target,
  targetId,
  mode,
  modes,
  back,
  label,
}: {
  target: "thread" | "forum"
  targetId: number
  /** The member's current cadence, or null when they do not follow this. */
  mode: string | null
  modes: readonly ModeOption[]
  back: string
  label: string
}) {
  const [state, action] = useActionState(subscribeAction, EMPTY_STATE)
  const [stopState, stopAction] = useActionState(unsubscribeAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-2">
      <FormError message={state.error ?? stopState.error} />

      <div className="flex flex-wrap items-center gap-2">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="target" value={target} />
          <input type="hidden" name="targetId" value={targetId} />
          <input type="hidden" name="back" value={back} />

          <label className="text-sm">
            <span className="mr-2">{mode === null ? label : "Notify me"}</span>
            <select
              name="mode"
              className={FIELD}
              defaultValue={mode ?? "instant"}
              aria-label="How often to notify me"
            >
              {modes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className={BUTTON}>
            {mode === null ? "Follow" : "Save"}
          </button>
        </form>

        {mode !== null && (
          <form action={stopAction}>
            <input type="hidden" name="target" value={target} />
            <input type="hidden" name="targetId" value={targetId} />
            <input type="hidden" name="back" value={back} />
            <button type="submit" className={QUIET_BUTTON}>
              Stop following
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

/** One row of the management screen: change the cadence, or stop. */
export function SubscriptionRowForm({
  target,
  targetId,
  mode,
  modes,
}: {
  target: "thread" | "forum"
  targetId: number
  mode: string
  modes: readonly ModeOption[]
}) {
  return (
    <FollowForm
      target={target}
      targetId={targetId}
      mode={mode}
      modes={modes}
      back="/subscriptions"
      label="Notify me"
    />
  )
}

/**
 * The one button behind an e-mail's unsubscribe link.
 *
 * The link itself is a GET that only *shows* this page. Unsubscribing is the
 * POST, because mail clients, security scanners and link previewers fetch every
 * URL in a message — a GET that acted would let a member's own spam filter
 * unsubscribe them.
 */
export function UnsubscribeConfirmForm({
  token,
  description,
}: {
  token: string
  description: string
}) {
  const [state, action] = useActionState(unsubscribeByTokenAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state.error} />
      <input type="hidden" name="token" value={token} />
      <p className="text-sm">{description}</p>
      <div>
        <button type="submit" className={BUTTON}>
          Unsubscribe
        </button>
      </div>
    </form>
  )
}
