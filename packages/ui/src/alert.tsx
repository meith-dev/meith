/**
 * An alert — shadcn/ui's, with the accessibility decision made in the component
 * rather than left to each caller.
 *
 * ## `role` is derived from `tone`, and that is deliberate
 *
 * `role="alert"` interrupts a screen-reader user mid-sentence. That is correct
 * for "your reply was not posted" and rude for "scheduled maintenance at 22:00",
 * and the difference is exactly the difference between an error and everything
 * else — so the component decides, and a caller cannot get it wrong by leaving
 * the prop off. `role` is still spreadable for the rare case that knows better.
 *
 * ## The tone is in the border and the text, not the fill
 *
 * A page can carry several of these at once — a flash message, a forum notice, a
 * moderation banner — and four saturated blocks stacked up read as a broken page
 * rather than as four things worth knowing. A left rule plus coloured text puts
 * the same information in a shape that stacks.
 */

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

/**
 * The kind, in words.
 *
 * Rendered inline with the message rather than as a heading above it: a notice
 * is one sentence, and "Warning" on its own line turns a sentence into a dialog
 * box. It is a `<strong>` so the announcement order is still right.
 */
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
