import type { FooterModel } from '@meith/theme-kit'

export function Footer({ boardTitle, links, timezoneLabel, poweredBy }: FooterModel) {
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
        <span>all times {timezoneLabel}</span>
        {poweredBy && (
          <a href={poweredBy.href} className="hover:text-foreground">
            {poweredBy.label}
          </a>
        )}
      </span>
    </footer>
  )
}
