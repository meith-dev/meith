import type { PaginationModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { cn } from '@meith/ui'

import { LABEL, NUMERIC, TOUCH } from '../shared'

const STEP = `inline-flex h-9 items-center gap-2 rounded-md px-3 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-accent ${TOUCH}`

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

  const c = (key: string) => fromSlotCopy(copy, `vershell.pagination.${key}`)

  return (
    <nav aria-label={c('nav')} className="flex flex-wrap items-center justify-between gap-4">
      {previousHref === null ? (
        <span className={cn(STEP, 'text-input hover:bg-transparent')} aria-hidden="true">
          <span>{c('previousArrow')}</span>
          {c('previous')}
        </span>
      ) : (
        <a href={previousHref} rel="prev" className={STEP}>
          <span aria-hidden="true">{c('previousArrow')}</span>
          {c('previous')}
        </a>
      )}

      <ol className={`${NUMERIC} flex items-center gap-1 text-[0.8125rem]`}>
        {pages.map((entry, index) => {
          const previous = pages[index - 1]
          const gap = previous !== undefined && entry.page - previous.page > 1

          return (
            <li key={entry.page} className="flex items-center gap-1">
              {gap && (
                <span aria-hidden="true" className="px-1 text-input">
                  {c('ellipsis')}
                </span>
              )}
              <a
                href={entry.href}
                aria-current={entry.isCurrent ? 'page' : undefined}
                aria-label={`${c('page')} ${entry.page}`}
                className={cn(
                  `inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 ${TOUCH} pointer-coarse:min-w-11`,
                  entry.isCurrent
                    ? 'bg-accent font-medium text-foreground shadow-[0_0_0_1px_var(--color-border)]'
                    : 'hidden text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-flex',
                )}
              >
                {entry.page}
              </a>
            </li>
          )
        })}

        <li className={`${LABEL} ml-2 whitespace-nowrap`}>
          {pageCountIsExact
            ? `${c('page')} ${page} ${c('of')} ${pageCount}`
            : `${c('page')} ${page}`}
        </li>
      </ol>

      {nextHref === null ? (
        <span className={cn(STEP, 'text-input hover:bg-transparent')} aria-hidden="true">
          {c('next')}
          <span>{c('nextArrow')}</span>
        </span>
      ) : (
        <a href={nextHref} rel="next" className={STEP}>
          {c('next')}
          <span aria-hidden="true">{c('nextArrow')}</span>
        </a>
      )}
    </nav>
  )
}
