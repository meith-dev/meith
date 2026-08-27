'use client'

import { useEffect, useState } from 'react'

import { Input, Field as UiField } from '@meith/ui'
import { InputOTP, InputOTPGroup, InputOTPSlot, REGEXP_ONLY_DIGITS } from '@meith/ui/input-otp'

import { type Copy, fromCopy } from '../shell/copy'

const OTP_LENGTH = 6
const OTP_SLOTS = Array.from({ length: OTP_LENGTH }, (_, index) => index)

export interface OtpRecoveryCopy {
  readonly label: string
  readonly hint?: string | undefined
  readonly toRecovery: string
  readonly toApp: string
}

export function otpRecoveryFromCopy(copy: Copy, hint?: string): OtpRecoveryCopy {
  return {
    label: fromCopy(copy, 'otp.recoveryLabel'),
    toRecovery: fromCopy(copy, 'otp.useRecovery'),
    toApp: fromCopy(copy, 'otp.useApp'),
    ...(hint === undefined ? {} : { hint }),
  }
}

export interface OtpFieldProps {
  readonly label: string
  readonly name?: string
  readonly id?: string
  readonly hint?: string | undefined
  readonly error?: string | undefined
  readonly required?: boolean
  readonly recovery?: OtpRecoveryCopy | undefined
}

function Toggle({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
    </button>
  )
}

export function OtpField({
  label,
  name = 'code',
  id,
  hint,
  error,
  required = true,
  recovery,
}: OtpFieldProps) {
  const [enhanced, setEnhanced] = useState(false)
  const [value, setValue] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)

  useEffect(() => {
    setEnhanced(true)
  }, [])

  if (!enhanced) {
    return (
      <UiField
        name={name}
        label={label}
        error={error ?? null}
        {...(id === undefined ? {} : { id })}
        {...(hint === undefined ? {} : { description: hint })}
      >
        {(control) => (
          <Input
            {...control}
            type="text"
            autoComplete="one-time-code"
            required={required}
            {...(recovery === undefined ? { inputMode: 'numeric' as const } : {})}
          />
        )}
      </UiField>
    )
  }

  if (recovery !== undefined && useRecovery) {
    return (
      <div className="flex flex-col gap-2">
        <UiField
          name={name}
          label={recovery.label}
          error={error ?? null}
          {...(id === undefined ? {} : { id })}
          {...(recovery.hint === undefined ? {} : { description: recovery.hint })}
        >
          {(control) => (
            <Input {...control} type="text" autoComplete="one-time-code" required={required} />
          )}
        </UiField>
        <Toggle onClick={() => setUseRecovery(false)}>{recovery.toApp}</Toggle>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <UiField
        name={name}
        label={label}
        error={error ?? null}
        {...(id === undefined ? {} : { id })}
        {...(hint === undefined ? {} : { description: hint })}
      >
        {(control) => (
          <InputOTP
            {...control}
            maxLength={OTP_LENGTH}
            pattern={REGEXP_ONLY_DIGITS}
            value={value}
            onChange={setValue}
            inputMode="numeric"
            autoComplete="one-time-code"
            required={required}
          >
            <InputOTPGroup>
              {OTP_SLOTS.map((slot) => (
                <InputOTPSlot key={slot} index={slot} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        )}
      </UiField>
      {recovery !== undefined ? (
        <Toggle onClick={() => setUseRecovery(true)}>{recovery.toRecovery}</Toggle>
      ) : null}
    </div>
  )
}
