'use client'

import { useActionState } from 'react'

import { Input } from '@meith/ui'
import { Button } from '@meith/ui/button'

import { EMPTY_STATE } from '@/server/auth-form-state'
import { proveCredentialAction } from '@/server/credential-proof-actions'

import { FormError } from '../auth/form-controls'

export interface CredentialProofCopy {
  readonly codeConsumed: string
  readonly codeLabel: string
  readonly codeSubmit: string
  readonly passwordLabel: string
  readonly passwordSubmit: string
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
            <Button type="submit" variant="primary">
              {copy.passwordSubmit}
            </Button>
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
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{copy.codeLabel}</span>
            <Input name="code" inputMode="numeric" autoComplete="one-time-code" required />
          </label>
          <p className="text-sm text-muted-foreground">{copy.codeConsumed}</p>
          <div>
            <Button type="submit" variant="primary">
              {copy.codeSubmit}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
