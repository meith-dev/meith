import type { FooterModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { RULE } from '../shared'

export function Footer({
  boardTitle,
  links,
  timezoneLabel,
  poweredBy,
  copy,
}: FooterModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `raidframe.footer.${key}`)

  return (
    <footer className="mt-auto">
      <div className={RULE} aria-hidden="true" />
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border bg-surface px-4 py-3 font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">
        <span className="inline-flex items-center gap-2 text-foreground">
          <span aria-hidden="true" className="size-2 rotate-45 border border-primary" />
          {boardTitle}
        </span>

        <nav aria-label={c('linksAriaLabel')} className="flex flex-wrap gap-x-4 gap-y-1">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-primary">
              {link.label}
            </a>
          ))}
        </nav>

        <span className="flex flex-wrap gap-x-4 gap-y-1">
          <span>
            {c('allTimesPrefix')}
            {timezoneLabel}
          </span>
          {poweredBy && (
            <a href={poweredBy.href} className="hover:text-primary">
              {poweredBy.label}
            </a>
          )}
        </span>
      </div>
    </footer>
  )
}
