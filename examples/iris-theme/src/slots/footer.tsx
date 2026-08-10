import type { FooterModel } from '@meith/theme-kit'

export function Footer({ boardTitle, links, timezoneLabel, poweredBy }: FooterModel) {
  return (
    <footer className="mt-auto border-t-2 border-primary bg-card">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-2 px-4 py-6 text-center text-xs text-muted-foreground">
        <span className="font-semibold uppercase tracking-widest text-foreground">
          {boardTitle}
        </span>

        {links.length > 0 && (
          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="underline decoration-primary underline-offset-2 hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}

        <span>
          Times are shown in {timezoneLabel}
          {poweredBy && (
            <>
              {' — '}
              <a
                href={poweredBy.href}
                className="underline decoration-primary underline-offset-2 hover:text-foreground"
              >
                {poweredBy.label}
              </a>
            </>
          )}
        </span>
      </div>
    </footer>
  )
}
