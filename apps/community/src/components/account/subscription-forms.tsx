'use client'

import { useActionState, useEffect, useState } from 'react'

import { buttonVariants, controlVariants } from '@meith/ui'

import { EMPTY_STATE } from '@/server/auth-form-state'
import {
  subscribeAction,
  unsubscribeAction,
  unsubscribeByTokenAction,
} from '@/server/subscription-actions'

import { FormError, PendingButton } from '../auth/form-controls'
import { ProgressiveMarker } from '../content/progressive-marker'
import { type Copy, fromCopy } from '../shell/copy'

const BUTTON = buttonVariants({ variant: 'primary', size: 'default' })

const QUIET_BUTTON = buttonVariants({ variant: 'outline', size: 'default' })

const GHOST_BUTTON = buttonVariants({ variant: 'ghost', size: 'default' })

const FIELD = controlVariants({ size: 'sm', className: 'w-auto max-w-full' })

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
  const [resolved, setResolved] = useState<boolean | null>(null)

  useEffect(() => {
    if (state.subscribed !== undefined) setResolved(state.subscribed)
  }, [state])

  useEffect(() => {
    if (stopState.subscribed !== undefined) setResolved(stopState.subscribed)
  }, [stopState])

  const subscribed = resolved ?? mode !== null

  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <FormError message={state.error ?? stopState.error} />

      <div className="flex flex-wrap items-center gap-2">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="target" value={target} />
          <input type="hidden" name="targetId" value={targetId} />
          <input type="hidden" name="back" value={back} />
          <ProgressiveMarker />

          <label className="text-sm">
            <span className="mr-2">
              {subscribed ? fromCopy(copy, 'accountForm.follow.notifyMe') : label}
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
            {subscribed
              ? fromCopy(copy, 'accountForm.follow.save')
              : fromCopy(copy, 'accountForm.follow.follow')}
          </PendingButton>
        </form>

        {subscribed && (
          <form action={stopAction}>
            <input type="hidden" name="target" value={target} />
            <input type="hidden" name="targetId" value={targetId} />
            <input type="hidden" name="back" value={back} />
            <ProgressiveMarker />
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
