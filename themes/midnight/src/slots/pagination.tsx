import type { PaginationModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

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

  const c = (key: string) => fromSlotCopy(copy, `midnight.pagination.${key}`)

  return (
    <nav
      aria-label={c('ariaLabel')}
      className="flex flex-wrap items-center gap-1 font-mono text-xs"
    >
      {previousHref !== null && (
        <a href={previousHref} rel="prev" className="border border-border px-2 py-1 hover:bg-muted">
          {c('prev')}
        </a>
      )}
      {pages.map((entry) =>
        entry.isCurrent ? (
          <span
            key={entry.href}
            aria-current="page"
            className="border border-primary bg-primary px-2 py-1 text-primary-foreground"
          >
            {entry.page}
          </span>
        ) : (
          <a
            key={entry.href}
            href={entry.href}
            className="border border-border px-2 py-1 hover:bg-muted"
          >
            {entry.page}
          </a>
        ),
      )}
      {nextHref !== null && (
        <a href={nextHref} rel="next" className="border border-border px-2 py-1 hover:bg-muted">
          {c('next')}
        </a>
      )}
      <span className="ml-2 text-muted-foreground">
        {c('page')} {pageCountIsExact ? `${page} ${c('pageOf')} ${pageCount}` : page}
      </span>
    </nav>
  )
}
