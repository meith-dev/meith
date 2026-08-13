import type { FooterModel } from '@meith/theme-kit'

import { ClubRule, HEADING, MICRO, MUTED_LINK, PAGE } from '../shared'

export function Footer({ boardTitle, links, timezoneLabel, poweredBy }: FooterModel) {
  return (
    <footer className="mt-auto">
      <ClubRule />
      <div className="bg-card">
        <div
          className={`${PAGE} flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6`}
        >
          <span className={`${HEADING} text-sm text-foreground`}>{boardTitle}</span>

          {links.length > 0 && (
            <nav aria-label="Footer" className={`flex flex-wrap gap-x-4 gap-y-1 ${MICRO}`}>
              {links.map((link) => (
                <a key={link.href} href={link.href} className={MUTED_LINK}>
                  {link.label}
                </a>
              ))}
            </nav>
          )}

          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:justify-end">
            <span>Times are shown in {timezoneLabel}</span>
            {poweredBy && (
              <a href={poweredBy.href} className={MUTED_LINK}>
                {poweredBy.label}
              </a>
            )}
          </span>
        </div>
      </div>
    </footer>
  )
}
