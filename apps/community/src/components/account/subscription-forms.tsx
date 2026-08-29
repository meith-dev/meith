'use client'

import { useActionState } from 'react'

import { EMPTY_STATE } from '@/server/auth-form-state'
import {
  subscribeAction,
  unsubscribeAction,
  unsubscribeByTokenAction,
} from '@/server/subscription-actions'

import { FormError, PendingButton } from '../auth/form-controls'
import { type Copy, fromCopy } from '../shell/copy'

const BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const QUIET_BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const GHOST_BUTTON =
  'inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const FIELD =
  'rounded-md border border-border bg-background px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

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
  copy,
}: {
  target: 'thread' | 'forum'
  targetId: number
  mode: string | null
  modes: readonly ModeOption[]
  back: string
  label: string
  copy: Copy
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
            <span className="mr-2">
              {mode === null ? label : fromCopy(copy, 'accountForm.follow.notifyMe')}
            </span>
            <select
              name="mode"
              className={FIELD}
              defaultValue={mode ?? 'instant'}
              aria-label={fromCopy(copy, 'accountForm.follow.frequency')}
            >
              {modes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <PendingButton className={QUIET_BUTTON}>
            {mode === null
              ? fromCopy(copy, 'accountForm.follow.follow')
              : fromCopy(copy, 'accountForm.follow.save')}
          </PendingButton>
        </form>

        {mode !== null && (
          <form action={stopAction}>
            <input type="hidden" name="target" value={target} />
            <input type="hidden" name="targetId" value={targetId} />
            <input type="hidden" name="back" value={back} />
            <PendingButton className={GHOST_BUTTON}>
              {fromCopy(copy, 'accountForm.follow.stop')}
            </PendingButton>
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
  copy,
}: {
  target: 'thread' | 'forum'
  targetId: number
  mode: string
  modes: readonly ModeOption[]
  copy: Copy
}) {
  return (
    <FollowForm
      target={target}
      targetId={targetId}
      mode={mode}
      modes={modes}
      back="/subscriptions"
      label={fromCopy(copy, 'accountForm.follow.notifyMe')}
      copy={copy}
    />
  )
}

export function UnsubscribeConfirmForm({
  token,
  description,
  copy,
}: {
  token: string
  description: string
  copy: Copy
}) {
  const [state, action] = useActionState(unsubscribeByTokenAction, EMPTY_STATE)

  return (
    <form action={action} className="flex flex-col gap-4">
      <FormError message={state.error} />
      <input type="hidden" name="token" value={token} />
      <p className="text-sm">{description}</p>
      <div>
        <PendingButton showWorking className={BUTTON}>
          {fromCopy(copy, 'accountForm.follow.unsubscribe')}
        </PendingButton>
      </div>
    </form>
  )
}
