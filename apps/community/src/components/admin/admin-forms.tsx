'use client'

import { useActionState } from 'react'

import { adminSignInAction, adminSignOutAction } from '@/server/admin-actions'
import { EMPTY_STATE } from '@/server/auth-form-state'

import { FormError, PendingButton } from '../auth/form-controls'
import { OtpField, otpRecoveryFromCopy } from '../auth/otp-field'
import { type Copy, formatFromCopy, fromCopy } from '../shell/copy'

export function AdminSignInForm({
  next,
  reason,
  idleMinutes,
  copy,
}: {
  next: string
  reason: 'expired' | 'reauth' | null
  idleMinutes: number
  copy: Copy
}) {
  const [state, action] = useActionState(adminSignInAction, EMPTY_STATE)

  return (
    <form
      action={action}
      className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-card p-6"
    >
      <h1 className="text-xl font-semibold tracking-tight">{fromCopy(copy, 'adminPanel.title')}</h1>

      <p className="text-sm text-muted-foreground">
        {reason === 'reauth'
          ? fromCopy(copy, 'adminPanel.reason.reauth')
          : reason === 'expired'
            ? fromCopy(copy, 'adminPanel.reason.expired')
            : fromCopy(copy, 'adminPanel.reason.default')}
      </p>

      <FormError message={state.error} />
      <input type="hidden" name="next" value={next} />

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{fromCopy(copy, 'adminPanel.password')}</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </label>

      <OtpField
        label={fromCopy(copy, 'adminPanel.twoFactorCode')}
        name="code"
        required={false}
        hint={fromCopy(copy, 'adminPanel.twoFactorCodeHint')}
        recovery={otpRecoveryFromCopy(copy)}
      />

      <PendingButton
        showWorking
        className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {fromCopy(copy, 'adminPanel.enter')}
      </PendingButton>

      <p className="text-xs text-muted-foreground">
        {formatFromCopy(copy, 'adminPanel.idleNote', { minutes: idleMinutes })}
      </p>
    </form>
  )
}

export function AdminSignOutForm({ copy }: { copy: Copy }) {
  return (
    <form action={adminSignOutAction}>
      <PendingButton
        showWorking
        className="text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {fromCopy(copy, 'adminPanel.leave')}
      </PendingButton>
    </form>
  )
}
