import type { PanelShellModel } from '@meith/theme-kit'

import { Arrow, EDITORIAL_RULE, Label, QUIET_LINK, SHELL, TOUCH } from '../shared'

export function PanelShell({ links, linksLabel, regions, children }: PanelShellModel) {
  return (
    <div className={`${SHELL} flex flex-1 flex-col gap-8 py-8 lg:flex-row lg:gap-12`}>
      <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:w-56 lg:shrink-0 lg:self-start">
        {regions.nav}

        {links.length > 0 && (
          <nav aria-label={linksLabel} className={`${EDITORIAL_RULE} pt-3`}>
            <Label>{linksLabel}</Label>
            <ul className="mt-2 flex flex-col">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className={`group inline-flex items-center py-1.5 text-[0.8125rem] font-medium text-muted-foreground ${QUIET_LINK} ${TOUCH}`}
                  >
                    {link.label}
                    <Arrow />
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
