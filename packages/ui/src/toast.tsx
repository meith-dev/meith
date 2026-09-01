'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import { useCallback, useEffect, useState } from 'react'

import { cn } from './utils'

export const toastVariants = cva(
  'pointer-events-auto flex w-[min(24rem,calc(100vw-2rem))] items-start justify-between gap-3 rounded-md border border-l-4 px-4 py-3 text-sm shadow-lg',
  {
    variants: {
      tone: {
        info: 'border-border border-l-muted-foreground bg-card text-card-foreground',
        success:
          'border-moderation-approved/30 border-l-moderation-approved bg-card text-card-foreground',
        warning: 'border-border border-l-moderation-pending bg-card text-card-foreground',
        error: 'border-destructive/30 border-l-destructive bg-card text-card-foreground',
      },
    },
    defaultVariants: { tone: 'info' },
  },
)

export type ToastTone = NonNullable<VariantProps<typeof toastVariants>['tone']>

export interface ToastProps {
  readonly children: React.ReactNode
  readonly tone?: ToastTone
  readonly dismissLabel: string
  readonly duration?: number
  readonly className?: string
  readonly onDismiss?: () => void
}

export function Toast({
  children,
  tone = 'info',
  dismissLabel,
  duration = 6000,
  className,
  onDismiss,
}: ToastProps) {
  const [open, setOpen] = useState(true)

  const dismiss = useCallback(() => {
    setOpen(false)
    onDismiss?.()
  }, [onDismiss])

  useEffect(() => {
    if (duration <= 0) return
    const timer = setTimeout(dismiss, duration)
    return () => clearTimeout(timer)
  }, [duration, dismiss])

  if (!open) return null

  const assertive = tone === 'error'

  return (
    <div
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      className={cn(toastVariants({ tone }), className)}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={dismissLabel}
        className="-mr-1 -mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  )
}
