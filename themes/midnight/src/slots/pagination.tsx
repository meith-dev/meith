import type { PaginationModel } from '@meith/theme-kit'

export function Pagination({
  page,
  pageCount,
  pageCountIsExact,
  pages,
  previousHref,
  nextHref,
}: PaginationModel) {
  if (pageCount <= 1 && previousHref === null && nextHref === null) return null

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1 font-mono text-xs">
      {previousHref !== null && (
        <a href={previousHref} rel="prev" className="border border-border px-2 py-1 hover:bg-muted">
          prev
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
          next
        </a>
      )}
      <span className="ml-2 text-muted-foreground">
        page {pageCountIsExact ? `${page} of ${pageCount}` : page}
      </span>
    </nav>
  )
}
