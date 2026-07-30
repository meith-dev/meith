import type { FooterModel } from '@forum/theme-kit'

/**
 * The board footer (F25/F27).
 *
 * The timezone note is not decoration: every timestamp on the board is formatted
 * server-side in one zone (see `TimeModel`), so the footer is where a reader
 * learns which one. Without it, "Today, 09:14" is ambiguous.
 */
export function Footer({ boardTitle, links, timezoneLabel }: FooterModel) {
  return (
    <footer className="mt-auto border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs text-muted-foreground">
        <span>{boardTitle}</span>

        <div className="flex flex-wrap gap-4">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-foreground">
              {link.label}
            </a>
          ))}
        </div>

        <span>Times shown in {timezoneLabel}</span>
      </div>
    </footer>
  )
}
