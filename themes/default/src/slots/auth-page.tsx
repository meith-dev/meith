import type { AuthPageModel } from '@meith/theme-kit'

import { MUTED_LINK } from '../shared'

export function AuthPage({ title, alert, links, regions }: AuthPageModel) {
  return (
    <main
      id="board-content"
      tabIndex={-1}
      className="flex flex-1 flex-col items-center justify-center px-6 py-12"
    >
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-2xl font-semibold text-foreground">{title}</h1>
          {regions.lede !== undefined && (
            <p className="text-sm text-muted-foreground">{regions.lede}</p>
          )}
        </div>

        {alert !== null && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          >
            {alert}
          </p>
        )}

        {regions.note !== undefined && (
          <p className="text-sm text-muted-foreground">{regions.note}</p>
        )}

        {regions.form}

        {links.length > 0 && (
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            {links.map((link) => (
              <span key={link.href}>
                {link.lead === null ? null : `${link.lead} `}
                <a
                  href={link.href}
                  className={link.lead === null ? MUTED_LINK : `font-medium text-foreground ${MUTED_LINK}`}
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
