import type { PanelShellModel } from '@meith/theme-kit'

import { MUTED_LINK } from '../shared'

const RAIL =
  'flex flex-col gap-4 px-6 pt-6 lg:sticky lg:w-56 lg:shrink-0 lg:self-start lg:py-8 lg:pr-0'

export function PanelShell({ panel, links, linksLabel, regions, children }: PanelShellModel) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col lg:flex-row">
      <aside className={`${RAIL} ${panel === 'admincp' ? 'lg:top-14' : 'lg:top-6'}`}>
        {regions.nav}

        {links.length > 0 && (
          <nav aria-label={linksLabel} className="border-t border-border pt-3 text-sm">
            <ul className="flex flex-col gap-0.5">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className={`block rounded-md px-3 py-1.5 ${MUTED_LINK} hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
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
