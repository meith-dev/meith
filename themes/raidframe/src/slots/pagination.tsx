import type { PaginationModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { MICRO, NUMERIC } from '../shared'

const STEP =
  'inline-flex min-w-8 items-center justify-center border border-border bg-card px-2 py-1 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] tabular-nums text-muted-foreground hover:border-primary/60 hover:text-primary'

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

  const c = (key: string) => fromSlotCopy(copy, `raidframe.pagination.${key}`)

  return (
    <nav aria-label={c('ariaLabel')} className="flex flex-wrap items-center gap-1.5">
      {previousHref !== null && (
        <a href={previousHref} rel="prev" className={STEP}>
          {c('prev')}
        </a>
      )}

      {pages.map((entry) =>
        entry.isCurrent ? (
          <span
            key={entry.href}
            aria-current="page"
            className={`${STEP} border-primary bg-primary text-primary-foreground hover:text-primary-foreground`}
          >
            {entry.page}
          </span>
        ) : (
          <a key={entry.href} href={entry.href} className={STEP}>
            {entry.page}
          </a>
        ),
      )}

      {nextHref !== null && (
        <a href={nextHref} rel="next" className={STEP}>
          {c('next')}
        </a>
      )}

      <span className={`${MICRO} ml-2 normal-case`}>
        <span className="uppercase">{c('page')}</span> <span className={NUMERIC}>{page}</span>
        {pageCountIsExact && (
          <>
            {' / '}
            <span className={NUMERIC}>{pageCount}</span>
          </>
        )}
      </span>
    </nav>
  )
}
