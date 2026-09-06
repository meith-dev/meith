'use client'

import { useActionState } from 'react'

import { buttonVariants, cn, controlVariants, PageTitle, surfaceVariants } from '@meith/ui'

import {
  adminAbandonSecondFactorAction,
  adminSignInAction,
  adminSignOutAction,
  adminVerifySecondFactorAction,
} from '@/server/admin-actions'
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
      className={cn(surfaceVariants({ padded: true }), 'w-full max-w-md gap-6 p-6 sm:p-8')}
    >
      <PageTitle className="sm:text-2xl">{fromCopy(copy, 'adminPanel.title')}</PageTitle>

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
          className={controlVariants()}
        />
      </label>

      <PendingButton showWorking className={buttonVariants({ variant: 'primary' })}>
        {fromCopy(copy, 'adminPanel.enter')}
      </PendingButton>

      <p className="text-xs text-muted-foreground">
        {formatFromCopy(copy, 'adminPanel.idleNote', { minutes: idleMinutes })}
      </p>
    </form>
  )
}

export function AdminSecondFactorForm({
  recoveryCodesLeft,
  copy,
}: {
  recoveryCodesLeft: number
  copy: Copy
}) {
  const [state, action] = useActionState(adminVerifySecondFactorAction, EMPTY_STATE)

  return (
    <div className={cn(surfaceVariants({ padded: true }), 'w-full max-w-md gap-6 p-6 sm:p-8')}>
      <PageTitle className="sm:text-2xl">{fromCopy(copy, 'adminPanel.twoFactor.title')}</PageTitle>

      <p className="text-sm text-muted-foreground">{fromCopy(copy, 'adminPanel.twoFactor.lede')}</p>

      <form action={action} className="flex flex-col gap-4" noValidate>
        <FormError message={state.error} />

        <OtpField
          label={fromCopy(copy, 'adminPanel.twoFactorCode')}
          name="code"
          hint={
            recoveryCodesLeft > 0
              ? fromCopy(copy, 'adminPanel.twoFactor.recoveryHint')
              : fromCopy(copy, 'adminPanel.twoFactor.recoveryHintExhausted')
          }
          recovery={otpRecoveryFromCopy(copy)}
        />

        <PendingButton showWorking className={buttonVariants({ variant: 'primary' })}>
          {fromCopy(copy, 'adminPanel.twoFactor.submit')}
        </PendingButton>
      </form>

      <form action={adminAbandonSecondFactorAction}>
        <PendingButton
          showWorking
          className="text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {fromCopy(copy, 'adminPanel.twoFactor.cancel')}
        </PendingButton>
      </form>
    </div>
  )
}

export function AdminSignOutForm({ copy }: { copy: Copy }) {
  return (
    <form action={adminSignOutAction}>
      <PendingButton
        title={fromCopy(copy, 'adminPanel.leave')}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'size-11 sm:w-auto sm:px-3',
        )}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5 sm:hidden"
        >
          <path d="M9 5H5v14h4M14 8l4 4-4 4M9 12h9" />
        </svg>
        <span className="sr-only sm:not-sr-only">{fromCopy(copy, 'adminPanel.leave')}</span>
      </PendingButton>
    </form>
  )
}
