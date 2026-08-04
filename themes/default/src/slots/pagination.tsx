import type { PaginationModel } from "@meith/theme-kit";

export function Pagination({ page, previousHref, nextHref }: PaginationModel) {
  if (previousHref === null && nextHref === null) return null;
  return (
    <nav
      aria-label="Thread pages"
      className="flex items-center justify-between text-sm"
    >
      {previousHref === null ? <span /> : <a href={previousHref}>Previous</a>}
      <span>Page {page}</span>
      {nextHref === null ? <span /> : <a href={nextHref}>Next</a>}
    </nav>
  );
}
