import type { PaginationModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { cn } from '@meith/ui'

import { BUTTON, MICRO, NUMERIC } from '../shared'

export function Pagination({
  page,
  pageCount,
  pageCountIsExact,
  pages,
  previousHref,
  nextHref,
  copy,
}: PaginationModel & { copy: SlotCopy }) {
  if (pageCount <= 1 && previousHref === null && nextHref === null) return null

  const c = (key: string) => fromSlotCopy(copy, `clubhouse.pagination.${key}`)

  const step = cn(BUTTON, 'min-w-20 justify-center border border-border bg-card hover:bg-accent')
  const stepDisabled = cn(step, 'pointer-events-none opacity-40')

  return (
    <nav aria-label={c('pagination')} className="flex flex-wrap items-center justify-between gap-3">
      {previousHref === null ? (
        <span className={stepDisabled} aria-hidden="true">
          {c('previous')}
        </span>
      ) : (
        <a href={previousHref} rel="prev" className={step}>
          {c('previous')}
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
                aria-label={`${c('page')} ${entry.page}`}
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
          <span className={NUMERIC}>
            {pageCountIsExact
              ? `${c('page')} ${page} ${c('of')} ${pageCount}`
              : `${c('page')} ${page}`}
          </span>
        </li>
      </ol>

      {nextHref === null ? (
        <span className={stepDisabled} aria-hidden="true">
          {c('next')}
        </span>
      ) : (
        <a href={nextHref} rel="next" className={step}>
          {c('next')}
        </a>
      )}
    </nav>
  )
}
