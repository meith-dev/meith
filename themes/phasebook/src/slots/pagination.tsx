import { cn } from '@meith/ui'
import type { PaginationModel } from '@meith/theme-kit'

import { NUMERIC, PILL } from '../shared'

export function Pagination({ page, pageCount, pages, previousHref, nextHref }: PaginationModel) {
  if (pageCount <= 1 && previousHref === null && nextHref === null) return null

  const disabled = cn(PILL, 'pointer-events-none opacity-40')

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-elevation"
    >
      {previousHref === null ? (
        <span className={disabled} aria-hidden="true">
          Previous
        </span>
      ) : (
        <a href={previousHref} rel="prev" className={PILL}>
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
                  'inline-flex size-9 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                  NUMERIC,
                  entry.isCurrent
                    ? 'bg-primary text-primary-foreground'
                    : 'hidden text-muted-foreground hover:bg-accent hover:text-foreground sm:inline-flex',
                )}
              >
                {entry.page}
              </a>
            </li>
          )
        })}

        <li className={`ml-1 text-xs whitespace-nowrap text-muted-foreground ${NUMERIC}`}>
          <span className="sr-only">Page </span>
          {page} of {pageCount}
        </li>
      </ol>

      {nextHref === null ? (
        <span className={disabled} aria-hidden="true">
          Next
        </span>
      ) : (
        <a href={nextHref} rel="next" className={PILL}>
          Next
        </a>
      )}
    </nav>
  )
}
