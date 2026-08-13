import type { PaginationModel } from '@meith/theme-kit'

import { MICRO, NUMERIC } from '../shared'

const STEP =
  'inline-flex min-w-8 items-center justify-center border border-border bg-card px-2 py-1 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] tabular-nums text-muted-foreground hover:border-primary/60 hover:text-primary'

export function Pagination({ page, pageCount, pages, previousHref, nextHref }: PaginationModel) {
  if (pageCount <= 1) return null

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1.5">
      {previousHref !== null && (
        <a href={previousHref} rel="prev" className={STEP}>
          prev
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
          next
        </a>
      )}

      <span className={`${MICRO} ml-2 normal-case`}>
        <span className="uppercase">page</span> <span className={NUMERIC}>{page}</span>
        {' / '}
        <span className={NUMERIC}>{pageCount}</span>
      </span>
    </nav>
  )
}
