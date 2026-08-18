import type { FooterModel, SlotCopy } from '@meith/theme-kit'
import { fromSlotCopy } from '@meith/theme-kit'

export function Footer({
  boardTitle,
  links,
  timezoneLabel,
  poweredBy,
  copy,
}: FooterModel & { copy: SlotCopy }) {
  const c = (key: string) => fromSlotCopy(copy, `midnight.footer.${key}`)

  return (
    <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border bg-secondary px-4 py-2 font-mono text-xs text-muted-foreground">
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
          <a href={poweredBy.href} className="hover:text-foreground">
            {poweredBy.label}
          </a>
        )}
      </span>
    </footer>
  )
}
