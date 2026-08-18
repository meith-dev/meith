import type { PaginationModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { cn } from '@meith/ui'

import { NUMERIC, PILL } from '../shared'

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

  const disabled = cn(PILL, 'pointer-events-none opacity-40')
  const c = (key: string) => fromSlotCopy(copy, `phasebook.pagination.${key}`)

  return (
    <nav
      aria-label={c('ariaLabel')}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 shadow-elevation"
    >
      {previousHref === null ? (
        <span className={disabled} aria-hidden="true">
          {c('previous')}
        </span>
      ) : (
        <a href={previousHref} rel="prev" className={PILL}>
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
          <span className="sr-only">{c('page')} </span>
          {pageCountIsExact ? `${page} ${c('of')} ${pageCount}` : `${c('page')} ${page}`}
        </li>
      </ol>

      {nextHref === null ? (
        <span className={disabled} aria-hidden="true">
          {c('next')}
        </span>
      ) : (
        <a href={nextHref} rel="next" className={PILL}>
          {c('next')}
        </a>
      )}
    </nav>
  )
}
