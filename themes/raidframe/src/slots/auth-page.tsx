import type { AuthPageModel } from '@meith/theme-kit'

import { Frame, HEADING, MICRO } from '../shared'

export function AuthPage({ title, alert, links, regions }: AuthPageModel) {
  return (
    <main
      id="board-content"
      tabIndex={-1}
      className="flex flex-1 flex-col items-center justify-center p-4"
    >
      <Frame className="w-full max-w-sm">
        <div className="flex flex-col gap-5 px-5 py-5">
          <div className="flex flex-col gap-1">
            <p className={`${MICRO} text-primary`}>access</p>
            <h1 className={`${HEADING} text-2xl text-foreground`}>{title}</h1>
            {regions.lede !== undefined && (
              <p className="text-sm text-muted-foreground">{regions.lede}</p>
            )}
          </div>

          {alert !== null && (
            <p
              role="alert"
              className="border border-l-[3px] border-border border-l-destructive bg-surface px-3 py-2 text-sm"
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
                  <a href={link.href} className="font-medium text-foreground hover:text-primary">
                    {link.label}
                  </a>
                </span>
              ))}
            </div>
          )}
        </div>
      </Frame>
    </main>
  )
}
