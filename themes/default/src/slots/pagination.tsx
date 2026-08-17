import type { PaginationModel } from '@meith/theme-kit'
import { buttonVariants, cn } from '@meith/ui'

import { NUMERIC } from '../shared'

export function Pagination({
  page,
  pageCount,
  pageCountIsExact,
  pages,
  previousHref,
  nextHref,
}: PaginationModel) {
  if (pageCount <= 1 && previousHref === null && nextHref === null) return null

  const step = cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'min-w-20')
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
                  buttonVariants({
                    variant: entry.isCurrent ? 'primary' : 'ghost',
                    size: 'sm',
                  }),
                  'min-w-8 px-2',
                  NUMERIC,
                  entry.isCurrent ? '' : 'hidden sm:inline-flex',
                )}
              >
                {entry.page}
              </a>
            </li>
          )
        })}

        <li className="ml-1 text-xs whitespace-nowrap text-muted-foreground">
          <span className={NUMERIC}>
            {pageCountIsExact ? `Page ${page} of ${pageCount}` : `Page ${page}`}
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
