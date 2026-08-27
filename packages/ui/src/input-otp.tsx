'use client'

import { OTPInput, OTPInputContext, REGEXP_ONLY_DIGITS } from 'input-otp'
import { type ComponentProps, useContext } from 'react'

import { cn } from './utils'

function InputOTP({
  className,
  containerClassName,
  ...props
}: ComponentProps<typeof OTPInput> & {
  containerClassName?: string
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        'flex items-center gap-2 has-[:disabled]:opacity-60',
        containerClassName,
      )}
      className={cn('disabled:cursor-not-allowed', className)}
      {...props}
    />
  )
}

function InputOTPGroup({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="input-otp-group" className={cn('flex items-center', className)} {...props} />
  )
}

function InputOTPSlot({
  index,
  className,
  ...props
}: ComponentProps<'div'> & {
  index: number
}) {
  const context = useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = context.slots[index] ?? {}

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive ? '' : undefined}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center border-y border-r border-input bg-card text-sm',
        'transition duration-100 outline-none',
        'first:rounded-l-md first:border-l last:rounded-r-md',
        'aria-invalid:border-destructive',
        'data-[active]:z-10 data-[active]:border-ring data-[active]:ring-[3px] data-[active]:ring-ring/50',
        'data-[active]:aria-invalid:border-destructive data-[active]:aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-px animate-pulse bg-foreground" />
        </div>
      )}
    </div>
  )
}

function InputOTPSeparator({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="input-otp-separator"
      aria-hidden="true"
      className={cn('flex items-center text-muted-foreground', className)}
      {...props}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="size-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <path d="M2.5 6h7" />
      </svg>
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot, REGEXP_ONLY_DIGITS }
