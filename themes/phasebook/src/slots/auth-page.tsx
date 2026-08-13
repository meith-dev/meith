import type { AuthPageModel } from '@meith/theme-kit'

import { LINK } from '../shared'

export function AuthPage({ title, alert, links, regions }: AuthPageModel) {
  return (
    <main
      id="board-content"
      tabIndex={-1}
      className="flex flex-1 flex-col items-center justify-center px-3 py-8 sm:px-4"
    >
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-elevation">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl leading-tight font-bold tracking-tight">{title}</h1>
          {regions.lede !== undefined && (
            <p className="text-sm text-muted-foreground">{regions.lede}</p>
          )}
        </div>

        {alert !== null && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/12 px-3 py-2 text-sm font-semibold text-destructive"
          >
            {alert}
          </p>
        )}

        {regions.note !== undefined && (
          <p className="text-sm text-muted-foreground">{regions.note}</p>
        )}

        {regions.form}

        {links.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm text-muted-foreground">
            {links.map((link) => (
              <span key={link.href}>
                {link.lead === null ? null : `${link.lead} `}
                <a href={link.href} className={`font-semibold ${LINK}`}>
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
