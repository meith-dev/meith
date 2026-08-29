'use client'

import { useActionState } from 'react'

import { buttonVariants, Input } from '@meith/ui'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { proveCredentialAction } from '@/server/credential-proof-actions'

import { FormError, PendingButton } from '../auth/form-controls'
import { OtpField } from '../auth/otp-field'

export interface CredentialProofCopy {
  readonly codeConsumed: string
  readonly codeLabel: string
  readonly codeSubmit: string
  readonly passwordLabel: string
  readonly passwordSubmit: string
  readonly recoveryLabel: string
  readonly useRecovery: string
  readonly useApp: string
}

export function CredentialProofForm({
  copy,
  hasPassword,
  hasSecondFactor,
  next,
}: {
  readonly copy: CredentialProofCopy
  readonly hasPassword: boolean
  readonly hasSecondFactor: boolean
  readonly next: string
}) {
  const [state, action] = useActionState(proveCredentialAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-4">
      <FormError message={state.error} />
      {hasPassword ? (
        <form
          action={action}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5"
        >
          <input type="hidden" name="method" value="password" />
          <input type="hidden" name="next" value={next} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{copy.passwordLabel}</span>
            <Input name="password" type="password" autoComplete="current-password" required />
          </label>
          <div>
            <PendingButton showWorking className={buttonVariants({ variant: 'primary' })}>
              {copy.passwordSubmit}
            </PendingButton>
          </div>
        </form>
      ) : null}
      {hasSecondFactor ? (
        <form
          action={action}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5"
        >
          <input type="hidden" name="method" value="code" />
          <input type="hidden" name="next" value={next} />
          <OtpField
            label={copy.codeLabel}
            name="code"
            recovery={{
              label: copy.recoveryLabel,
              toRecovery: copy.useRecovery,
              toApp: copy.useApp,
              hint: copy.codeConsumed,
            }}
          />
          <p className="text-sm text-muted-foreground">{copy.codeConsumed}</p>
          <div>
            <PendingButton showWorking className={buttonVariants({ variant: 'primary' })}>
              {copy.codeSubmit}
            </PendingButton>
          </div>
        </form>
      ) : null}
    </div>
  )
}
