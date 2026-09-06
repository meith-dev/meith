'use client'

import { useEffect, useState } from 'react'

import { Input } from './field'
import { cn } from './utils'

export interface PasswordInputProps extends Omit<React.ComponentProps<'input'>, 'type'> {
  readonly showLabel: string
  readonly hideLabel: string
}

export function PasswordInput({
  showLabel,
  hideLabel,
  className,
  disabled,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)
  const [enhanced, setEnhanced] = useState(false)

  useEffect(() => setEnhanced(true), [])

  return (
    <span data-slot="password-input" className="relative block min-w-0">
      <Input
        {...props}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
        className={cn(className, 'pr-12')}
      />
      {enhanced && (
        <button
          type="button"
          disabled={disabled}
          aria-label={visible ? hideLabel : showLabel}
          aria-controls={props.id}
          title={visible ? hideLabel : showLabel}
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path d="m3 3 18 18" />}
          </svg>
        </button>
      )}
    </span>
  )
}
