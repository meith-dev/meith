'use client'

import { useActionState } from 'react'

import { Button } from '@meith/ui/button'

import { abandonSecondFactorAction, verifySecondFactorAction } from '@/server/auth-actions'
import { EMPTY_STATE } from '@/server/auth-form-state'

import { Field, FormError, SubmitButton } from './form-controls'

export function SecondFactorForm({
  next,
  recoveryCodesLeft,
}: {
  readonly next?: string | undefined
  readonly recoveryCodesLeft: number
}) {
  const [state, action] = useActionState(verifySecondFactorAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4" noValidate>
        <FormError message={state.error} />

        <Field
          label="Code from your authenticator app"
          name="code"
          autoComplete="one-time-code"
          hint={
            recoveryCodesLeft > 0
              ? 'Or one of the recovery codes you saved when you set this up.'
              : 'Or one of the recovery codes you saved when you set this up. You have none left — replace them from your account security page once you are in.'
          }
        />

        {next ? <input type="hidden" name="next" value={next} /> : null}
        <SubmitButton>Finish signing in</SubmitButton>
      </form>

      <form action={abandonSecondFactorAction}>
        <Button type="submit" variant="ghost" size="sm">
          Cancel and sign in as somebody else
        </Button>
      </form>
    </div>
  )
}
