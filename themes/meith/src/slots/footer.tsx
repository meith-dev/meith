import type { FooterModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { Arrow, LABEL, QUIET_LINK, SHELL, TOUCH } from '../shared'

const FOOTER_LINK = `group inline-flex items-center py-2 font-mono text-[0.6875rem] font-medium tracking-[0.075em] text-muted-foreground uppercase ${QUIET_LINK} ${TOUCH}`

export function Footer({
  boardTitle,
  links,
  timezoneLabel,
  poweredBy,
  regions,
  copy,
}: FooterModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `meith.footer.${key}`)

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
        className={`${SHELL} flex flex-col gap-6 pt-10 pb-8 sm:flex-row sm:items-center sm:justify-between sm:gap-12`}
      >
        <span className="block font-heading text-[clamp(2rem,5vw,3rem)] leading-none font-normal tracking-[-0.025em] text-primary [overflow-wrap:anywhere]">
          {boardTitle}
        </span>

        {links.length > 0 && (
          <nav
            aria-label={c('nav')}
            className="flex max-w-[27rem] flex-wrap items-center gap-x-7 gap-y-1 sm:justify-end"
          >
            {links.map((link) => (
              <a key={link.href} href={link.href} className={FOOTER_LINK}>
                {link.label}
                <Arrow className="text-[1.1em] leading-none" />
              </a>
            ))}
          </nav>
        )}
      </div>

      <div
        className={`${SHELL} flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border py-5 sm:justify-end`}
      >
        <span className={LABEL}>
          {c('timesShownIn')} {timezoneLabel}
        </span>
        {poweredBy && (
          <a
            href={poweredBy.href}
            target="_blank"
            rel="noreferrer"
            className={`${LABEL} group ${QUIET_LINK}`}
          >
            {poweredBy.label}
            <Arrow />
          </a>
        )}
      </div>
    </footer>
  )
}
