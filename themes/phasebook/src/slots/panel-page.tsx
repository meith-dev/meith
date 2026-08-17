import type { PanelPageModel, PanelSectionModel } from '@meith/theme-kit'
import { cn } from '@meith/ui'

import { MUTED_LINK } from '../shared'

export function PanelPage({ title, back, frame, width, gap, regions, children }: PanelPageModel) {
  return (
    <main
      id="board-content"
      tabIndex={-1}
      className={cn(
        'flex w-full flex-col',
        frame === 'standalone'
          ? `mx-auto flex-1 px-3 py-4 sm:px-4 lg:py-6 ${
              width === 'wide' ? 'max-w-6xl' : 'max-w-4xl'
            }`
          : width === 'wide'
            ? 'max-w-none'
            : 'max-w-4xl',
        gap === 'loose' ? 'gap-4' : 'gap-3',
      )}
    >
      <header className="rounded-lg border border-border bg-card px-4 py-3.5 shadow-elevation">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col gap-1">
            {back !== null && (
              <a href={back.href} className={`text-xs font-semibold ${MUTED_LINK}`}>
                ← {back.label}
              </a>
            )}

            <h1 className="text-xl leading-tight font-bold tracking-tight text-balance">{title}</h1>

            {regions.lede !== undefined && (
              <p className="text-sm text-muted-foreground">{regions.lede}</p>
            )}
            {regions.meta !== undefined && (
              <p className="text-xs text-muted-foreground">{regions.meta}</p>
            )}
          </div>

          {regions.actions !== undefined && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{regions.actions}</div>
          )}
        </div>
      </header>

      {children}
    </main>
  )
}

export function PanelSection({ title, headingId, regions, children }: PanelSectionModel) {
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={headingId} className="text-[0.9375rem] font-semibold text-muted-foreground">
            {title}
          </h2>
          {regions.description !== undefined && (
            <p className="text-sm text-muted-foreground">{regions.description}</p>
          )}
        </div>

        {regions.actions !== undefined && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{regions.actions}</div>
        )}
      </div>

      {children}
    </section>
  )
}
