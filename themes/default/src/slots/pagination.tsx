import { buttonVariants, cn } from '@meith/ui'
import type { PaginationModel } from '@meith/theme-kit'

import { NUMERIC } from '../shared'

/**
 * Page links (F30).
 *
 * ## This slot used to throw away most of its model
 *
 * `PaginationModel` has carried `pages` — a resolved window of `{ page, href,
 * isCurrent }` — and `pageCount` since F30, and the previous implementation
 * rendered "Previous / Page 2 / Next". On a forty-page thread that is thirty-nine
 * clicks to reach the end of an argument, and no way at all to jump back to
 * where you were reading last week. The app was resolving the window and the
 * theme was dropping it: nothing failed, and the page looked finished.
 *
 * The window is rendered as it arrives. The theme does **not** compute which
 * pages to show, and could not: `pages` is already the app's answer, and a theme
 * that sliced it would be second-guessing paging logic it cannot see the query
 * for. Where the app leaves a gap in the sequence — page 1, then page 8 — this
 * renders an ellipsis, because two adjacent numbers that are not adjacent pages
 * is the one way a page list can actively mislead.
 *
 * ## Anchors, always
 *
 * Paging is `<a href>` and nothing else, so it works with JavaScript disabled
 * (R5), survives being opened in a new tab, and is followed by search engines.
 * That is also why `Pagination` is a `server` slot in the registry and can never
 * become an island.
 *
 * ## The narrow screen gets fewer numbers, not none
 *
 * The full window would wrap onto three lines on a phone. The numbers other than
 * the current one are hidden below `sm` and the previous/next controls grow
 * instead, which keeps the two things a thumb actually uses at thumb size.
 */
export function Pagination({ page, pageCount, pages, previousHref, nextHref }: PaginationModel) {
  /* One page is not a paging problem, and a bar saying "Page 1 of 1" is noise. */
  if (pageCount <= 1 && previousHref === null && nextHref === null) return null

  const step = cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'min-w-20')
  const stepDisabled = cn(step, 'pointer-events-none opacity-40')

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      {previousHref === null ? (
        /*
         * Present but inert, rather than absent. A control that disappears at
         * the first page makes the next/previous pair jump sideways as you
         * move through a thread, and the *other* control moves with it.
         */
        <span className={stepDisabled} aria-hidden="true">
          Previous
        </span>
      ) : (
        <a href={previousHref} rel="prev" className={step}>
          Previous
        </a>
      )}

      <ol className="flex items-center gap-1">
        {pages.map((entry, index) => {
          const previous = pages[index - 1]
          const gap = previous !== undefined && entry.page - previous.page > 1

          return (
            <li key={entry.page} className="flex items-center gap-1">
              {gap && (
                <span aria-hidden="true" className="px-1 text-sm text-muted-foreground">
                  …
                </span>
              )}
              <a
                href={entry.href}
                aria-current={entry.isCurrent ? 'page' : undefined}
                aria-label={`Page ${entry.page}`}
                className={cn(
                  buttonVariants({
                    variant: entry.isCurrent ? 'primary' : 'ghost',
                    size: 'sm',
                  }),
                  'min-w-8 px-2',
                  NUMERIC,
                  /* Only the page you are on survives the narrow layout. */
                  entry.isCurrent ? '' : 'hidden sm:inline-flex',
                )}
              >
                {entry.page}
              </a>
            </li>
          )
        })}

        {/*
          The total, for the reader whose next question is "how much is left" —
          and the only place `pageCount` appears, since the window itself may
          not reach the end.
        */}
        <li className="ml-1 text-xs whitespace-nowrap text-muted-foreground">
          <span className="sr-only">Page </span>
          <span className={NUMERIC}>
            {page} of {pageCount}
          </span>
        </li>
      </ol>

      {nextHref === null ? (
        <span className={stepDisabled} aria-hidden="true">
          Next
        </span>
      ) : (
        <a href={nextHref} rel="next" className={step}>
          Next
        </a>
      )}
    </nav>
  )
}
