import type { FooterModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

import { MUTED_LINK, PAGE } from '../shared'

export function Footer({
  boardTitle,
  links,
  timezoneLabel,
  poweredBy,
  regions,
  copy,
}: FooterModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `phasebook.footer.${key}`)

  return (
    <footer className="mt-auto bg-background">
      <div className={`${PAGE} flex flex-col gap-2 py-6 text-xs text-muted-foreground`}>
        {regions?.controls && (
          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 pb-2">
            {regions.controls}
          </div>
        )}
        {links.length > 0 && (
          <nav aria-label={c('ariaLabel')} className="flex flex-wrap gap-x-4 gap-y-1">
            {links.map((link) => (
              <a key={link.href} href={link.href} className={MUTED_LINK}>
                {link.label}
              </a>
            ))}
          </nav>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-foreground">{boardTitle}</span>
          <span>
            {c('timezone')} {timezoneLabel}
          </span>
          {poweredBy && (
            <a href={poweredBy.href} target="_blank" rel="noreferrer" className={MUTED_LINK}>
              {poweredBy.label}
            </a>
          )}
        </div>
      </div>
    </footer>
  )
}
