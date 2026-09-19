import type { FooterModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { LABEL, Logomark, SHELL, TOUCH } from '../shared'

const FOOTER_LINK = `inline-flex items-center py-1.5 text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground ${TOUCH}`

export function Footer({
  boardTitle,
  links,
  timezoneLabel,
  poweredBy,
  regions,
  copy,
}: FooterModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `vershell.footer.${key}`)

  return (
    <footer className="mt-auto border-t border-border bg-background">
      {regions?.controls && (
        <div
          className={`${SHELL} flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border py-3`}
        >
          {regions.controls}
        </div>
      )}

      <div
        className={`${SHELL} flex flex-col gap-6 py-10 sm:flex-row sm:items-start sm:justify-between sm:gap-12`}
      >
        <div className="flex items-center gap-2">
          <Logomark className="size-5 shrink-0" />
          <span className="font-heading text-[0.9375rem] font-semibold tracking-[-0.02em] text-foreground [overflow-wrap:anywhere]">
            {boardTitle}
          </span>
        </div>

        {links.length > 0 && (
          <nav
            aria-label={c('nav')}
            className="grid grid-cols-2 gap-x-10 gap-y-0.5 sm:flex sm:flex-wrap sm:justify-end"
          >
            {links.map((link) => (
              <a key={link.href} href={link.href} className={FOOTER_LINK}>
                {link.label}
              </a>
            ))}
          </nav>
        )}
      </div>

      <div
        className={`${SHELL} flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border py-5`}
      >
        <span className={LABEL}>
          {c('timesShownIn')} {timezoneLabel}
        </span>
        {poweredBy && (
          <a
            href={poweredBy.href}
            target="_blank"
            rel="noreferrer"
            className={`${LABEL} ms-auto transition-colors hover:text-foreground`}
          >
            {poweredBy.label}
          </a>
        )}
      </div>
    </footer>
  )
}
