import type { PanelShellModel } from '@meith/theme-kit'

import { MICRO } from '../shared'

export function PanelShell({ panel, links, linksLabel, regions, children }: PanelShellModel) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col lg:flex-row">
      <aside
        className={`flex flex-col gap-3 p-4 lg:sticky lg:w-56 lg:shrink-0 lg:self-start lg:pr-0 ${
          panel === 'admincp' ? 'lg:top-14' : 'lg:top-4'
        }`}
      >
        {regions.nav}

        {links.length > 0 && (
          <nav aria-label={linksLabel} className="border-t border-border pt-3">
            <ul className="flex flex-col gap-1">
              {links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className={`${MICRO} block hover:text-primary`}>
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
