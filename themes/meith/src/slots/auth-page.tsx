import type { AuthPageModel } from '@meith/theme-kit'

import { EDITORIAL_RULE, LEDE, META, PAGE_TITLE, RULE, SHELL, TEXT_LINK } from '../shared'

export function AuthPage({ title, alert, links, regions }: AuthPageModel) {
  return (
    <main
      id="board-content"
      tabIndex={-1}
      className={`${SHELL} flex flex-1 flex-col py-10 sm:py-14`}
    >
      <div className={`${EDITORIAL_RULE} mx-auto flex w-full max-w-md flex-col gap-6 pt-5`}>
        <div className="flex flex-col gap-2">
          <h1 className={PAGE_TITLE}>{title}</h1>
          {regions.lede !== undefined && <p className={LEDE}>{regions.lede}</p>}
        </div>

        {alert !== null && (
          <p
            role="alert"
            className="border border-border border-l-4 border-l-foreground px-4 py-3 text-[0.9375rem] leading-relaxed text-foreground"
          >
            {alert}
          </p>
        )}

        {regions.note !== undefined && <p className={META}>{regions.note}</p>}

        {regions.form}

        {links.length > 0 && (
          <div className={`${RULE} flex flex-col gap-1.5 pt-5 ${META}`}>
            {links.map((link) => (
              <span key={link.href}>
                {link.lead === null ? null : `${link.lead} `}
                <a href={link.href} className={`font-medium text-foreground ${TEXT_LINK}`}>
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
