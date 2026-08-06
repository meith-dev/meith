import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from './utils'

const alertVariants = cva(
  'flex w-full items-start justify-between gap-4 rounded-md border border-l-4 px-4 py-3 text-sm',
  {
    variants: {
      tone: {
        info: 'border-border border-l-muted-foreground bg-card text-card-foreground',
        success: 'border-border border-l-moderation-approved bg-card text-card-foreground',
        warning: 'border-border border-l-moderation-pending bg-card text-card-foreground',
        error: 'border-destructive/30 border-l-destructive bg-destructive/5 text-card-foreground',
      },
    },
    defaultVariants: { tone: 'info' },
  },
)

export type AlertTone = NonNullable<VariantProps<typeof alertVariants>['tone']>

function Alert({
  className,
  tone = 'info',
  role,
  ...props
}: React.ComponentProps<'div'> & { tone?: AlertTone }) {
  return (
    <div
      data-slot="alert"
      data-tone={tone}
      role={role ?? (tone === 'error' ? 'alert' : 'status')}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<'strong'>) {
  return (
    <strong
      data-slot="alert-title"
      className={cn('font-semibold text-foreground', className)}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="alert-description"
      className={cn('min-w-0 [&_a]:underline [&_a]:underline-offset-2', className)}
      {...props}
    />
  )
}

export { Alert, AlertDescription, AlertTitle, alertVariants }
