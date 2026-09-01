import type { FooterModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

export function Footer({
  boardTitle,
  links,
  timezoneLabel,
  poweredBy,
  regions,
  copy,
}: FooterModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `midnight.footer.${key}`)

  return (
    <footer className="mt-auto border-t border-border bg-secondary font-mono text-xs text-muted-foreground">
      {regions?.controls && (
        <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 border-b border-border px-4 py-2">
          {regions.controls}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <span>{boardTitle}</span>
        <div className="flex flex-wrap gap-3">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-foreground">
              {link.label}
            </a>
          ))}
        </div>
        <span className="flex flex-wrap gap-3">
          <span>
            {c('allTimes')} {timezoneLabel}
          </span>
          {poweredBy && (
            <a
              href={poweredBy.href}
              target="_blank"
              rel="noreferrer"
              className="hover:text-foreground"
            >
              {poweredBy.label}
            </a>
          )}
        </span>
      </div>
    </footer>
  )
}
