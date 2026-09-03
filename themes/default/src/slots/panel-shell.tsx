import type { PanelShellModel } from '@meith/theme-kit'

import { BELOW_DESKTOP_HEADER, EYEBROW, MUTED_LINK } from '../shared'

const RAIL =
  'flex flex-col gap-4 px-4 pt-5 sm:px-6 lg:sticky lg:w-64 lg:shrink-0 lg:self-start lg:pt-8 lg:pr-0'

function SwitchGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0 text-muted-foreground/70"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 3.5 9.5 7 6 10.5M3 7h6.5M13 3v8" />
    </svg>
  )
}

export function PanelShell({ panel, links, linksLabel, regions, children }: PanelShellModel) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col lg:flex-row lg:gap-8">
      <aside className={`${RAIL} ${panel === 'admincp' ? 'lg:top-14' : BELOW_DESKTOP_HEADER}`}>
        {regions.nav}

        {links.length > 0 && (
          <nav
            aria-label={linksLabel}
            className="hidden rounded-xl border border-border bg-card p-2 shadow-elevation lg:block"
          >
            <p className={`${EYEBROW} px-3 pt-1.5 pb-1.5`}>{linksLabel}</p>
            <ul className="flex flex-col gap-0.5 text-sm">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 ${MUTED_LINK} hover:bg-muted hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
                  >
                    <SwitchGlyph />
                    <span className="min-w-0 flex-1 truncate">{link.label}</span>
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
          className="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 pt-2 pb-6 text-sm sm:px-6 lg:hidden"
        >
          <span className={`${EYEBROW} me-1`}>{linksLabel}</span>
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <SwitchGlyph />
              {link.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  )
}
