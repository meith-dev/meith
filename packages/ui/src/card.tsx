import { cn } from './utils'

type CardElement = 'section' | 'article' | 'div'

export interface CardProps extends React.ComponentProps<'section'> {
  readonly as?: CardElement
}

function Card({ as = 'section', className, ...props }: CardProps) {
  const Component = as as React.ElementType

  return (
    <Component
      data-slot="card"
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-elevation',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-surface px-4 py-2.5',
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="card-title"
      className={cn('text-base font-semibold tracking-tight text-foreground', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('flex shrink-0 flex-wrap items-center gap-2', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-4 py-3.5', className)} {...props} />
}

function CardRows({ className, ...props }: React.ComponentProps<'ul'>) {
  return <ul data-slot="card-rows" className={cn('divide-y divide-border', className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex flex-wrap items-center gap-3 border-t border-border px-4 py-2.5 text-xs text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardRows,
  CardTitle,
}
