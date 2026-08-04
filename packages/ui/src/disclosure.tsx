/**
 * An accordion, built on `<details>`.
 *
 * ## Why not Base UI's Accordion
 *
 * Because of what is inside this one. The board's quick reply is the control a
 * member posts with, and the board's headline property is that it works with
 * scripting off (R5). A Base UI `Accordion` trigger is a button whose panel
 * opens from JavaScript — so with scripting disabled the panel never opens and
 * the composer becomes unreachable. That is not a degraded experience, it is a
 * board you cannot post to.
 *
 * `<details>` is a native disclosure widget: the browser toggles it, the
 * keyboard works, screen readers announce it as expandable and report its
 * state, and it costs no bytes at all. Base UI is the right answer when the
 * behaviour is genuinely beyond HTML — the account menu needs Escape,
 * click-outside, arrow keys and a portal, and gets `Menu` for exactly that.
 * This needs open and closed.
 *
 * ## `open` is a nudge, not a controlled value
 *
 * React writes the attribute when the prop changes and leaves the element alone
 * otherwise, so a reader who opens the panel keeps it open. That is what makes
 * it usable for "open yourself when there is something to see" — an error from
 * a failed submit, a draft waiting — without taking the toggle away from the
 * person using it.
 *
 * That matters most with scripting *off*, where a failed submit is a full page
 * reload: without the nudge the error would render inside a panel that reset to
 * closed, and the member would be looking at a collapsed box wondering why
 * nothing happened.
 */

import { cn } from './utils'

export interface DisclosureProps extends Omit<React.ComponentProps<'details'>, 'children'> {
  /** The always-visible row. Becomes the `<summary>`. */
  readonly summary: React.ReactNode
  /** Shown to the trailing edge of the summary — a count, a hint. */
  readonly aside?: React.ReactNode
  readonly children: React.ReactNode
  readonly contentClassName?: string
}

function Disclosure({
  summary,
  aside,
  children,
  className,
  contentClassName,
  ...props
}: DisclosureProps) {
  return (
    <details
      data-slot="disclosure"
      className={cn(
        'group overflow-hidden rounded-lg border border-border bg-card text-card-foreground',
        className,
      )}
      {...props}
    >
      <summary
        className={cn(
          'flex cursor-default list-none items-center gap-2 px-4 py-2.5 text-sm font-medium select-none',
          'transition-colors hover:bg-muted',
          /*
           * Safari draws its own triangle through a pseudo-element that
           * `list-style: none` does not remove, and Chrome used to. Both are
           * covered here so the caret below is the only marker anywhere.
           */
          '[&::-webkit-details-marker]:hidden [&::marker]:content-none',
        )}
      >
        {/*
          Rotates on open. `aria-hidden` because `<summary>` already reports
          expanded/collapsed to assistive technology — a second announcement of
          the same state is noise.
        */}
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="size-3 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4.5 3 3 3-3 3" />
        </svg>

        <span className="min-w-0 flex-1 truncate">{summary}</span>

        {aside !== undefined && (
          <span className="shrink-0 text-xs font-normal text-muted-foreground">{aside}</span>
        )}
      </summary>

      <div className={cn('border-t border-border p-4', contentClassName)}>{children}</div>
    </details>
  )
}

export { Disclosure }
