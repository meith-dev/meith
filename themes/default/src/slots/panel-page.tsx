import type { PanelPageModel, PanelSectionModel } from '@meith/theme-kit'
import { cn } from '@meith/ui'

import { MUTED_LINK, PAGE, pageAt } from '../shared'

export function PanelPage({ title, back, frame, width, gap, regions, children }: PanelPageModel) {
  return (
    <main
      id="board-content"
      tabIndex={-1}
      className={cn(
        'flex w-full flex-col py-8',
        frame === 'standalone'
          ? `flex-1 ${width === 'wide' ? PAGE : pageAt('max-w-4xl')}`
          : `px-6 ${width === 'wide' ? 'max-w-none' : 'max-w-4xl'}`,
        gap === 'loose' ? 'gap-8' : 'gap-6',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          {back !== null && (
            <a href={back.href} className={`text-sm font-medium ${MUTED_LINK}`}>
              ← {back.label}
            </a>
          )}

          <h1 className="font-heading text-2xl font-semibold text-foreground">{title}</h1>

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

      {children}
    </main>
  )
}

export function PanelSection({ title, headingId, regions, children }: PanelSectionModel) {
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={headingId} className="font-heading text-lg font-semibold text-foreground">
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
