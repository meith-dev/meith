import { cn } from '@meith/ui'
import type { PaginationModel } from '@meith/theme-kit'

import { BUTTON, MICRO, NUMERIC } from '../shared'

export function Pagination({ page, pageCount, pages, previousHref, nextHref }: PaginationModel) {
  if (pageCount <= 1 && previousHref === null && nextHref === null) return null

  const step = cn(BUTTON, 'min-w-20 justify-center border border-border bg-card hover:bg-accent')
  const stepDisabled = cn(step, 'pointer-events-none opacity-40')

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      {previousHref === null ? (
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
                  BUTTON,
                  'min-w-8 justify-center px-2.5',
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

        <li className={`ml-2 whitespace-nowrap ${MICRO}`}>
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
