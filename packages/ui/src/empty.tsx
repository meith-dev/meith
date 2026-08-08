/**
 * The empty state.
 *
 * A forum is mostly empty on its first day and permanently empty in one corner
 * or another after that: a new forum with no threads, a search with no results,
 * a members list filtered down to nobody. Rendering nothing for those is the
 * commonest way board software looks broken — a reader cannot tell an empty
 * forum from a forum that failed to load, and the difference matters most
 * exactly when the board is new and the reader is deciding whether to stay.
 *
 * So the component asks for a sentence and, where there is one, the way out.
 * `EmptyAction` is optional because "no results" sometimes has no next step, but
 * "this forum has no threads" always does and it is *post the first one*.
 */

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
