import { cn } from './utils'

function Empty({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty"
      className={cn(
        'flex flex-col items-center gap-2 px-6 py-12 text-center text-balance',
        className,
      )}
      {...props}
    />
  )
}

function EmptyTitle({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="empty-title"
      className={cn('text-sm font-medium text-foreground', className)}
      {...props}
    />
  )
}

function EmptyDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="empty-description"
      className={cn('max-w-prose text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function EmptyAction({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="empty-action" className={cn('mt-2', className)} {...props} />
}

export { Empty, EmptyAction, EmptyDescription, EmptyTitle }
