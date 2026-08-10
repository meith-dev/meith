"use client"

import { useActionState } from "react"

import { subscribeAction, unsubscribeAction, unsubscribeByTokenAction } from "@/server/subscription-actions"
import { EMPTY_STATE } from "@/server/auth-form-state"

import { FormError } from "../auth/form-controls"

const BUTTON =
  "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

const QUIET_BUTTON =
  "inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

const GHOST_BUTTON =
  "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

const FIELD =
  "rounded-md border border-border bg-background px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"

export interface ModeOption {
  readonly value: string
  readonly label: string
}

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
  mode: string | null
  modes: readonly ModeOption[]
  back: string
  label: string
}) {
  const [state, action] = useActionState(subscribeAction, EMPTY_STATE)
  const [stopState, stopAction] = useActionState(unsubscribeAction, EMPTY_STATE)

  return (
    <section aria-label={label} className="flex flex-col gap-2">
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

          <button type="submit" className={QUIET_BUTTON}>
            {mode === null ? "Follow" : "Save"}
          </button>
        </form>

        {mode !== null && (
          <form action={stopAction}>
            <input type="hidden" name="target" value={target} />
            <input type="hidden" name="targetId" value={targetId} />
            <input type="hidden" name="back" value={back} />
            <button type="submit" className={GHOST_BUTTON}>
              Stop following
            </button>
          </form>
        )}
      </div>
    </section>
  )
}

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
