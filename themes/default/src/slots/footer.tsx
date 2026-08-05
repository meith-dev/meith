import type { FooterModel } from '@meith/theme-kit'

import { MUTED_LINK, PAGE } from '../shared'

/**
 * The board footer (F25/F27).
 *
 * The timezone note is not decoration: every timestamp on the board is formatted
 * server-side in one zone (see `TimeModel`), so the footer is where a reader
 * learns which one. Without it, "Today, 09:14" is ambiguous — and a member whose
 * own zone is set (F57) is reading a *different* board's worth of times from
 * their neighbour, with nothing on the page saying so.
 *
 * It reads as a sentence rather than as a bare label for that reason. "Europe/
 * London" in a corner is a string; "Times are shown in Europe/London" is an
 * answer to the question somebody actually has.
 */
export function Footer({ boardTitle, links, timezoneLabel, poweredBy }: FooterModel) {
  return (
    <footer className="mt-auto border-t border-border bg-card">
      <div
        className={`${PAGE} flex flex-col gap-2 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-6`}
      >
        <span className="font-medium text-foreground">{boardTitle}</span>

        {links.length > 0 && (
          <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1">
            {links.map((link) => (
              <a key={link.href} href={link.href} className={MUTED_LINK}>
                {link.label}
              </a>
            ))}
          </nav>
        )}

        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end sm:text-right">
          <span>Times are shown in {timezoneLabel}</span>
          {/*
            Optional in the model (0.8), so a theme built against 0.7 is
            unaffected — and rendered here quietly. An attribution that shouts
            is an advert; one that sits beside the timezone note is a fact about
            the board, which is what it is.
          */}
          {poweredBy && (
            <a href={poweredBy.href} className={MUTED_LINK}>
              {poweredBy.label}
            </a>
          )}
        </span>
      </div>
    </footer>
  )
}
