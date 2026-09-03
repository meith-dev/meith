import type { PaginationModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { buttonVariants, cn } from '@meith/ui'

import { NUMERIC } from '../shared'

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

  const c = (key: string) => fromSlotCopy(copy, `default.pagination.${key}`)

  const step = cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'min-w-20 rounded-full')
  const stepDisabled = cn(step, 'pointer-events-none opacity-40')

  return (
    <nav aria-label={c('nav')} className="flex flex-wrap items-center justify-between gap-3">
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
                  {c('ellipsis')}
                </span>
              )}
              <a
                href={entry.href}
                aria-current={entry.isCurrent ? 'page' : undefined}
                aria-label={`${c('page')} ${entry.page}`}
                className={cn(
                  buttonVariants({
                    variant: entry.isCurrent ? 'primary' : 'ghost',
                    size: 'sm',
                  }),
                  'min-w-8 rounded-full px-2',
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
