/**
 * A panel — shadcn/ui's Card, with the pieces a board actually stacks.
 *
 * A forum page is panels containing *rows*: a category with twenty forums under
 * it, a thread page with fifty posts. So `CardContent` is not the only body
 * shape here — `CardRows` renders a `<ul>` whose children are separated by a
 * rule rather than by a gap, which is the difference between a listing you can
 * scan and twenty small cards you have to.
 *
 * Every piece is a plain element. Nothing here holds state, so nothing here is
 * a client component, and a thread page built out of these ships no JavaScript.
 */

import { cn } from './utils'

/**
 * The element a card renders as.
 *
 * A panel is a `<section>` most of the time, and a post is an `<article>` —
 * independently distributable content with its own author, which is the exact
 * definition — so the choice has to be the caller's. Base UI would express this
 * with `render`, which needs `useRender` and therefore a client boundary; on a
 * page of fifty postbits that is the whole cost of the component set for the
 * sake of one tag name.
 *
 * The three are spelled out rather than left open. A card that could be a
 * `<button>` or a `<td>` is a card whose ARIA nobody can reason about, and this
 * way `as` cannot be handed something whose props are wrong for the spread.
 */
type CardElement = 'section' | 'article' | 'div'

export interface CardProps extends React.ComponentProps<'section'> {
  readonly as?: CardElement
}

/**
 * `overflow-hidden` is load-bearing rather than tidy: the header and the rows
 * inside a card have square corners, and without it they sit proud of the
 * card's rounded ones at exactly the two places a reader's eye goes first.
 */
function Card({ as = 'section', className, ...props }: CardProps) {
  /*
   * `ElementType` rather than a union in the JSX position: TypeScript refuses to
   * construct an element from a union of intrinsic tag names, and the props are
   * already constrained by the signature above — the three tags accept the same
   * attributes, so nothing is being waved through.
   */
  const Component = as as React.ElementType

  return (
    <Component
      data-slot="card"
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card text-card-foreground',
        className,
      )}
      {...props}
    />
  )
}

/** The tinted bar at the top of a panel: a category name, a post's byline. */
function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border bg-muted px-4 py-2.5',
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
      className={cn('font-serif text-base font-semibold text-foreground', className)}
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

/** The controls that belong to a panel's header, pushed to its trailing edge. */
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

/**
 * A ruled list. The empty state is the caller's — a listing with nothing in it
 * has something specific to say, and "no rows" said generically is a shrug.
 */
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
