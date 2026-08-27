'use client'

import { useActionState } from 'react'

import { Button } from '@meith/ui/button'

import { abandonSecondFactorAction, verifySecondFactorAction } from '@/server/auth-actions'
import { EMPTY_STATE } from '@/server/auth-form-state'

import { type Copy, fromCopy } from '../shell/copy'
import { FormError, SubmitButton } from './form-controls'
import { OtpField, otpRecoveryFromCopy } from './otp-field'

export function SecondFactorForm({
  next,
  recoveryCodesLeft,
  copy,
}: {
  readonly next?: string | undefined
  readonly recoveryCodesLeft: number
  readonly copy: Copy
}) {
  const [state, action] = useActionState(verifySecondFactorAction, EMPTY_STATE)

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4" noValidate>
        <FormError message={state.error} />

        <OtpField
          label={fromCopy(copy, 'authForm.secondFactor.code')}
          name="code"
          hint={
            recoveryCodesLeft > 0
              ? fromCopy(copy, 'authForm.secondFactor.recoveryHint')
              : fromCopy(copy, 'authForm.secondFactor.recoveryHintExhausted')
          }
          recovery={otpRecoveryFromCopy(copy)}
        />

        {next ? <input type="hidden" name="next" value={next} /> : null}
        <SubmitButton>{fromCopy(copy, 'authForm.secondFactor.submit')}</SubmitButton>
      </form>

      <form action={abandonSecondFactorAction}>
        <Button type="submit" variant="ghost" size="sm">
          {fromCopy(copy, 'authForm.secondFactor.cancel')}
        </Button>
      </form>
    </div>
  )
}
