import type { PanelShellModel } from '@meith/theme-kit'

import { MUTED_LINK } from '../shared'

const RAIL =
  'flex flex-col gap-4 px-4 pt-4 sm:px-6 lg:sticky lg:w-60 lg:shrink-0 lg:self-start lg:py-8 lg:pr-0'

export function PanelShell({ panel, links, linksLabel, regions, children }: PanelShellModel) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col lg:flex-row">
      <aside className={`${RAIL} ${panel === 'admincp' ? 'lg:top-14' : 'lg:top-6'}`}>
        {regions.nav}

        {links.length > 0 && (
          <nav
            aria-label={linksLabel}
            className="hidden rounded-lg border border-border bg-card p-2 shadow-elevation lg:block"
          >
            <p className="px-2.5 pt-1 pb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {linksLabel}
            </p>
            <ul className="flex flex-col gap-0.5 text-sm">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className={`block rounded-lg px-2.5 py-1.5 ${MUTED_LINK} hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </aside>

      <div className="min-w-0 flex-1">{children}</div>

      {links.length > 0 && (
        <nav
          aria-label={linksLabel}
          className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-2 text-sm sm:px-6 lg:hidden"
        >
          {links.map((link) => (
            <a key={link.href} href={link.href} className={MUTED_LINK}>
              {link.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  )
}
