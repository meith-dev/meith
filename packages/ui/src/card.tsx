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
 *
 * ## The shadow is a token, which is what makes it safe to put here
 *
 * `shadow-elevation` resolves to `--elevation`, and a theme that wants a flat
 * board sets that to `none` — which `midnight` does, because a terminal has no
 * depth. So this line adds lift to the default theme and changes nothing at all
 * for a theme that has said it does not want any, without either theme having to
 * override `Card` to get the look it asked for. A literal `shadow-sm` here would
 * have forced midnight to fork the component to remove it.
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
        'overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-elevation',
        className,
      )}
      {...props}
    />
  )
}

/**
 * The tinted bar at the top of a panel: a category name, a post's byline.
 *
 * `bg-surface`, not `bg-muted`. They were the same shade of grey and they are
 * not the same idea: `muted` also means "this control is disabled" and backs a
 * hovered row, so an operator darkening their panel headings was also darkening
 * every disabled button on the board. `surface` is the band and nothing else.
 */
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

/**
 * `tracking-tight` rather than a face of its own.
 *
 * This was `font-serif`, which put every panel heading on the board in
 * Newsreader — a good display serif, and the voice of a marketing site that no
 * longer exists in that form. The board reads in one face now; a heading is
 * distinguished by weight and by a slightly tighter fit, which is what the sans
 * scale is built for and what the redesigned site does.
 *
 * It stays face-less rather than becoming `font-heading` like the app's page
 * headings. A panel title is a *label* on a region — "Latest posts", a category
 * name — and it sits at 16px in a dense listing; a board that gives its headings
 * a display face means the ones somebody reads as headings, not every ruled bar
 * on the index. An operator who wants those too can say so in their own CSS.
 */
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
