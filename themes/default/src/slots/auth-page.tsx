import type { AuthPageModel } from '@meith/theme-kit'

import { MUTED_LINK } from '../shared'

export function AuthPage({ title, alert, links, regions }: AuthPageModel) {
  return (
    <main
      id="board-content"
      tabIndex={-1}
      className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 sm:py-14"
    >
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-elevation sm:p-8">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {regions.lede !== undefined && (
            <p className="text-sm text-muted-foreground">{regions.lede}</p>
          )}
        </div>

        {alert !== null && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          >
            {alert}
          </p>
        )}

        {regions.note !== undefined && (
          <p className="text-sm text-muted-foreground">{regions.note}</p>
        )}

        {regions.form}

        {links.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t border-border pt-5 text-sm text-muted-foreground">
            {links.map((link) => (
              <span key={link.href}>
                {link.lead === null ? null : `${link.lead} `}
                <a
                  href={link.href}
                  className={
                    link.lead === null ? MUTED_LINK : `font-medium text-foreground ${MUTED_LINK}`
                  }
                >
                  {link.label}
                </a>
              </span>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
