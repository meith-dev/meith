import type { PanelShellModel } from '@meith/theme-kit'

import { MUTED_LINK } from '../shared'

export function PanelShell({ panel, links, linksLabel, regions, children }: PanelShellModel) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-3 py-4 sm:px-4 lg:flex-row lg:py-6">
      <aside
        className={`flex flex-col gap-3 lg:sticky lg:w-60 lg:shrink-0 lg:self-start ${
          panel === 'admincp' ? 'lg:top-16' : 'lg:top-4'
        }`}
      >
        {regions.nav}

        {links.length > 0 && (
          <nav
            aria-label={linksLabel}
            className="rounded-lg border border-border bg-card p-2 text-sm shadow-elevation"
          >
            <ul className="flex flex-col">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className={`block rounded-full px-3 py-2 font-semibold ${MUTED_LINK} hover:bg-accent hover:text-foreground hover:no-underline`}
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
    </div>
  )
}
