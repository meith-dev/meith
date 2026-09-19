import type { PaginationModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'
import { cn } from '@meith/ui'

import { LABEL, NUMERIC, QUIET_LINK, RULE, TOUCH } from '../shared'

const STEP = `inline-flex min-h-10 items-center gap-2 text-[0.8125rem] font-medium text-foreground ${QUIET_LINK} ${TOUCH}`

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

  const c = (key: string) => fromSlotCopy(copy, `meith.pagination.${key}`)

  return (
    <nav
      aria-label={c('nav')}
      className={`${RULE} flex flex-wrap items-center justify-between gap-4 pt-4`}
    >
      {previousHref === null ? (
        <span className={cn(STEP, 'text-input')} aria-hidden="true">
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
                  `inline-flex min-h-10 min-w-8 items-center justify-center px-2 ${TOUCH} pointer-coarse:min-w-11`,
                  entry.isCurrent
                    ? 'text-primary underline decoration-primary decoration-1 underline-offset-[0.3em]'
                    : `hidden text-muted-foreground ${QUIET_LINK} sm:inline-flex`,
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
        <span className={cn(STEP, 'text-input')} aria-hidden="true">
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
